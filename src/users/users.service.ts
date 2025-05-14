import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { ILike, Repository } from 'typeorm';

import * as bcrypt from 'bcryptjs';
import { UserValues } from './entities/values.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { Message } from 'src/conversation/entities/message.entity';
import { FilterBy } from 'src/common/type';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { chatSummaryPrompt } from 'src/products/constants';

@Injectable()
export class UsersService {
  private openai: OpenAI;
  private openaiModal: string;
  private readonly logger = new Logger(UsersService.name);
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(UserValues)
    private userValuesRepository: Repository<UserValues>,

    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,

    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not defined in the environment variables.',
      );
    }

    this.openai = new OpenAI({ apiKey });

    this.openaiModal =
      this.configService.get<string>('AI_ASSISTANT_MODAL') || 'gpt-3.5-turbo';
  }

  async create(
    name: string,
    email: string,
    password: string,
    role: string,
  ): Promise<{ user: User | null; message: string }> {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = this.userRepository.create({
        name,
        email,
        password: hashedPassword,
        role,
      });
      return {
        user: await this.userRepository.save(user),
        message: 'Register successfully',
      };
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation for PostgreSQL
        return { user: null, message: 'User with this email already exists' };
      }
      return { user: null, message: 'An unexpected error occurred' };
    }
  }

  async createBetaUser(
    email: string,
    firstName: string,
  ): Promise<{ user: User | null; message: string }> {
    try {
      const checkUser = await this.userRepository.findOne({
        where: {
          email,
          role: 'beta',
        },
      });

      if (checkUser) {
        throw new BadRequestException('User with this Email Already exists!');
      }

      const user = this.userRepository.create({
        name: firstName,
        email,
        password: '',
        role: 'beta',
      });
      return {
        user: await this.userRepository.save(user),
        message: 'Beta Account Created',
      };
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation for PostgreSQL
        return { user: null, message: 'User with this email already exists' };
      }
      return { user: null, message: 'An unexpected error occurred' };
    }
  }

  async findBetaUsers(filters: FilterBy): Promise<any> {
    const { orderBy = 'created_date', sortBy = 'ASC' }: FilterBy = filters;

    const validSortDirections = ['ASC', 'DESC'];

    const sortDirection = validSortDirections.includes(sortBy.toUpperCase())
      ? sortBy.toUpperCase()
      : 'ASC';

    const orderOptions = orderBy
      ? { [orderBy]: sortDirection }
      : { created_date: 'ASC' };

    const data = await this.userRepository.find({
      where: { role: 'beta' },
      // @ts-ignore
      order: orderOptions,
    });
    return {
      data,
      message: '',
    };
  }

  async deleteBetaUser(id: string) {
    const checkUser = await this.userRepository.findOne({
      where: { id, role: 'beta' },
    });
    if (!checkUser) {
      throw new NotFoundException('No User Found');
    }

    await this.userRepository.delete({
      id: checkUser.id,
    });
    return {
      data: null,
      message: 'Beta User Deleted',
    };
  }

  async findOne(email: string): Promise<User | undefined> {
    return this.userRepository.findOne({ where: { email } });
  }

  async createUserValue(name: string, text: string): Promise<UserValues> {
    const promptValue = this.userValuesRepository.create({ name, text });
    return this.userValuesRepository.save(promptValue);
  }

  async findUserValueByName(name: string): Promise<UserValues | undefined> {
    return this.userValuesRepository.findOne({ where: { name } });
  }

  async updateUserValueByName(
    name: string,
    text: string,
  ): Promise<UserValues | null> {
    const userValue = await this.userValuesRepository.findOne({
      where: { name },
    });

    if (userValue) {
      userValue.text = text;
      return this.userValuesRepository.save(userValue);
    }

    return null;
  }

  async updateUserTokenUsage(userId: string, tokensUsed: number) {
    // Fetch the user's current token count
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Increment the token count
    const newTokenCount = user.tokensUsed + tokensUsed;
    // Update the user's token count in the database
    return await this.userRepository.update(userId, {
      tokensUsed: newTokenCount,
    });
  }

  async getAdminReports(filters: FilterBy): Promise<{
    totalChat: number;
    totalThread: number;
    totalRegisterUser: number;
    totalNonRegisterUser: number;
    userList: User[];
    conversationList: Conversation[];
  }> {
    const { orderBy = 'created_date', sortBy = 'ASC' }: FilterBy = filters;

    const validSortDirections = ['ASC', 'DESC'];

    const sortDirection = validSortDirections.includes(sortBy.toUpperCase())
      ? sortBy.toUpperCase()
      : 'ASC';

    const orderOptions = orderBy
      ? { [orderBy]: sortDirection }
      : { created_date: 'ASC' };

    const promises: [
      Promise<number>,
      Promise<number>,
      Promise<number>,
      Promise<number>,
      Promise<User[]>,
      Promise<Conversation[]>,
    ] = [
      this.conversationRepo.count().catch(() => 0),
      this.messageRepo.count().catch(() => 0),
      this.userRepository.count().catch(() => 0),
      this.conversationRepo.count({ where: { isGuest: true } }).catch(() => 0),
      this.userRepository
        .find({
          relations: ['conversations', 'conversations.messages'],
          // @ts-ignore
          order: orderOptions,
        })
        .catch((): User[] => []),
      this.conversationRepo
        .createQueryBuilder('conversation')
        .leftJoinAndSelect('conversation.messages', 'messages')
        .leftJoinAndSelect('conversation.user', 'user')
        .select([
          "unnest(string_to_array(conversation.productName, ',')) AS productName", // Split productName into individual names
          'COUNT(DISTINCT conversation.id) AS count', // Count distinct conversations
          'json_agg(DISTINCT messages) AS messages', // Aggregate messages
          "json_agg(DISTINCT jsonb_build_object('id', user.id, 'name', user.name, 'email', user.email)) AS users", // Aggregate users
        ])
        .where(
          "conversation.productName IS NOT NULL AND conversation.productName <> ''",
        )
        .groupBy('productName') // Group only by productName
        .orderBy('count', 'DESC') // Sort by count in descending order
        .getRawMany()
        .catch((): Conversation[] => []),
    ];

    // Execute all promises in parallel
    const [
      totalChat,
      totalThread,
      totalRegisterUser,
      totalNonRegisterUser,
      userList,
      conversationList,
    ] = await Promise.all(promises);
    return {
      totalChat,
      totalThread,
      totalRegisterUser,
      totalNonRegisterUser,
      userList,
      conversationList,
    };
  }

  async getConversationByUserId({
    userId,
  }: {
    userId: string;
  }): Promise<Conversation[]> {
    return await this.conversationRepo
      .find({
        where: { userId: userId },
        relations: ['messages', 'user'],
        order: { createdAt: 'ASC' },
      })
      .catch((): Conversation[] => []);
  }

  async getConversationByProductName(
    productName: string,
  ): Promise<Conversation[]> {
    return this.conversationRepo
      .find({
        where: {
          productName: ILike(`%${productName}%`),
        },
        relations: ['messages', 'user'],
        order: { createdAt: 'ASC' },
      })
      .catch((): Conversation[] => []);
  }

  async createUserIntentRecord(email: string, conversationId) {
    try {
      const conversation = await this.conversationRepo.findOne({
        where: { id: conversationId },
        relations: ['messages', 'user'],
        order: { createdAt: 'ASC' },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found 🕵️‍♂️');
      }

      const mappedMessages = conversation.messages.map(({ content, role }) => ({
        content,
        role,
      }));

      const summarizedResponse = await this.openai.chat.completions.create({
        model: this.openaiModal,
        messages: [
          { role: 'system', content: chatSummaryPrompt },
          ...mappedMessages,
        ],
      });

      const summary =
        summarizedResponse.choices[0]?.message?.content ??
        'No summary available';

      return {
        data: {
          userEmail: email,
          summary,
        },
        message: ' Thanks for your Mail! We will be in touch with you!',
      };
    } catch (error) {
      this.logger.error('Failed to Summarize Chat!', error?.message);

      return {
        data: null,
        message: 'Thanks for your Mail! We will be in touch with you!',
      };
    }
  }
}
