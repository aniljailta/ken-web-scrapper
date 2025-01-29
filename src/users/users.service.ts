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
    username: string,
    password: string,
    role: string,
  ): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      username,
      password: hashedPassword,
      role,
    });
    return this.userRepository.save(user);
  }

  async findOne(username: string): Promise<User | undefined> {
    return this.userRepository.findOne({ where: { username } });
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
