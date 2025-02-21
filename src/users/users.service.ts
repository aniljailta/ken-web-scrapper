import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';

import * as bcrypt from 'bcryptjs';
import { UserValues } from './entities/values.entity';
import { Conversation } from 'src/conversation/entities/conversation.entity';
import { Message } from 'src/conversation/entities/message.entity';

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
          "unnest(string_to_array(COALESCE(conversation.productName, ''), ',')) AS productName",
          'COUNT(DISTINCT conversation.id) AS count',
          'json_agg(DISTINCT messages) AS messages', // Aggregate messages
          "jsonb_build_object('id', user.id, 'name', user.name, 'email', user.email) AS user", // User object
        ])
        .where(
          "conversation.productName IS NOT NULL AND conversation.productName <> ''",
        )
        .groupBy('productName, user.id, user.name, user.email') // Ensure proper grouping
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

  async getConversationByUserId({ userId }): Promise<Conversation[]> {
    // Define all the promises

    return await this.conversationRepo
      .find({
        where: { userId: userId },
        relations: ['messages', 'user'],
      })
      .catch((): Conversation[] => []);
  }
}
