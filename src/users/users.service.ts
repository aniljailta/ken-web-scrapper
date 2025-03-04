import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { ILike, Repository } from 'typeorm';

import * as bcrypt from 'bcryptjs';
import { UserValues } from './entities/values.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { Message } from 'src/conversation/entities/message.entity';
import { generateBetaUsername } from './utils';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(UserValues)
    private userValuesRepository: Repository<UserValues>,

    @InjectRepository(Conversation)
    private conversationRepo: Repository<Conversation>,

    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
  ) {}

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
    password: string,
  ): Promise<{ user: User | null; message: string }> {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const name = generateBetaUsername();
      const user = this.userRepository.create({
        name,
        email,
        password: hashedPassword,
        role: 'beta',
      });
      return {
        user: await this.userRepository.save(user),
        message: 'Beta user Created!',
      };
    } catch (error) {
      console.log('🚀 ~ UsersService ~ error:', error);
      if (error.code === '23505') {
        // Unique constraint violation for PostgreSQL
        return { user: null, message: 'User with this email already exists' };
      }
      return { user: null, message: 'An unexpected error occurred' };
    }
  }

  async findBetaUsers(): Promise<any> {
    const data = await this.userRepository.find({ where: { role: 'beta' } });
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

  async getAdminReports(): Promise<{
    totalChat: number;
    totalThread: number;
    totalRegisterUser: number;
    totalNonRegisterUser: number;
    userList: User[];
    conversationList: Conversation[];
  }> {
    // Define all the promises
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
      userList: userList.sort(
        (a, b) => b.conversations.length - a.conversations.length,
      ),
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
}
