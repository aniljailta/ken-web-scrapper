import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AuthGuard } from '@nestjs/passport';
import { UserValues } from './entities/values.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Post('register')
  async register(
    @Body('username') username: string,
    @Body('password') password: string,
    @Body('role') role: string,
  ): Promise<User> {
    return this.usersService.create(username, password, role);
  }

  @Get(':username')
  async findOne(@Param('username') username: string): Promise<User> {
    return this.usersService.findOne(username);
  }

  @Post('user-values')
  @UseGuards(AuthGuard('jwt'))
  async createUserValue(
    @Body('name') name: string,
    @Body('text') text: string,
  ): Promise<UserValues> {
    return this.usersService.createUserValue(name, text);
  }

  @Post('user-values-by-name')
  @UseGuards(AuthGuard('jwt'))
  async getUserValuesByName(
    @Req() req,
    @Body('name') name: string,
  ): Promise<UserValues | null> {
    const user = req.user; // Logged-in user details from JWT

    if (user.role === 'admin') {
      return this.usersService.findUserValueByName(name);
    }
  }

  @Post('update-user-value')
  @UseGuards(AuthGuard('jwt'))
  async updateUserValue(
    @Req() req,
    @Body('name') name: string,
    @Body('text') text: string,
  ) {
    const user = req.user;

    if (user.role === 'admin') {
      const updatedValue = await this.usersService.updateUserValueByName(
        name,
        text,
      );
      return { message: 'Value updated successfully', updatedValue };
    }
    return { message: 'Unauthorized' };
  }
}
