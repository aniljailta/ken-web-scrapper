import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findOne(email);
    if (user && bcrypt.compareSync(password, user.password)) {
      return user;
    }
    return null;
  }

  async login(user: any) {
    const payload = {
      name: user.name,
      email: user.email,
      sub: user.id,
      password: user.password,
      role: user.role,
    };
    const token = this.jwtService.sign(payload);

    const userDetails = await this.usersService.findOne(user.email);

    return {
      access_token: token,
      ...userDetails,
    };
  }

  async resetUserPassword(
    email: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findOne(email);
    if (!user) {
      throw new NotFoundException('No User Found with this Email');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "New Password Can't be same as Previous One!",
      );
    }

    const isPasswordValid = await this.validateUser(email, currentPassword);
    if (!isPasswordValid) {
      throw new BadRequestException("Current Password Doesn't Match!");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.userRepository.update(
      {
        id: user.id,
      },
      {
        password: hashedPassword,
      },
    );

    const payload = {
      name: user.name,
      email: user.email,
      sub: user.id,
      password: user.password,
      role: user.role,
    };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      ...user,
      message: 'Password has been reset!',
    };
  }

  async setBetaPassword(email: string, password: string) {
    const user = await this.userRepository.findOne({
      where: {
        email,
        role: 'beta',
      },
    });
    if (!user) {
      throw new NotFoundException('No User Found with this Email');
    }

    if (user.password) {
      throw new BadRequestException(
        'Password Is already setup for this account Please Login Instead!',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await this.userRepository.update(
      {
        id: user.id,
      },
      {
        password: hashedPassword,
      },
    );

    const payload = {
      name: user.name,
      email: user.email,
      sub: user.id,
      password: user.password,
      role: user.role,
    };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      ...user,
      message: 'Password has been set!',
    };
  }
}
