import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';

import * as bcrypt from 'bcryptjs';
import { UserValues } from './entities/values.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(UserValues)
    private userValuesRepository: Repository<UserValues>,
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
}
