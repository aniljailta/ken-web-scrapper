import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AuthGuard } from '@nestjs/passport';
import { UserValues } from './entities/values.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('admin-reports')
  @UseGuards(AuthGuard('jwt'))
  async getAdminReports(
    @Req() req,
    @Query('sortBy') sortBy?: string,
    @Query('orderBy') orderBy?: string,
  ) {
    const user = req.user;
    if (user.role === 'admin') {
      const data = await this.usersService.getAdminReports({ sortBy, orderBy });
      return { message: 'success', data };
    }

    return { message: 'Unauthorized' };
  }

  @Get('conversation-by-user-id')
  @UseGuards(AuthGuard('jwt'))
  async getAdminReportsByUserId(@Req() req, @Query('userId') userId: string) {
    const user = req.user;
    if (user.role === 'admin') {
      const data = await this.usersService.getConversationByUserId({ userId });
      return { message: 'success', data };
    }

    return { message: 'Unauthorized', data: [] };
  }

  @Get('conversation-by-product-name')
  @UseGuards(AuthGuard('jwt'))
  async getConversationByProductName(
    @Req() req,
    @Query('productName') productName: string,
  ) {
    const user = req.user;
    if (user.role === 'admin') {
      const data =
        await this.usersService.getConversationByProductName(productName);
      return { message: 'success', data };
    }

    return { message: 'Unauthorized', data: [] };
  }

  @Post('register')
  async register(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('role') role: string,
  ): Promise<{ user: User | null; message: string }> {
    return this.usersService.create(name, email, password, role);
  }

  @Post('invite-beta-user')
  async inviteBetaTester(
    @Body('email') email: string,
    @Body('firstName') firstName: string,
  ): Promise<{ user: User | null; message: string }> {
    return this.usersService.createBetaUser(email, firstName);
  }

  @Get('beta-users')
  async getAllBetaUsers(
    @Query('sortBy') sortBy?: string,
    @Query('orderBy') orderBy?: string,
  ): Promise<User[]> {
    return this.usersService.findBetaUsers({ sortBy, orderBy });
  }

  @Delete('beta-user/:id')
  async(@Param('id') id: string): Promise<any> {
    return this.usersService.deleteBetaUser(id);
  }

  @Get(':email')
  async findOne(@Param('email') email: string): Promise<User> {
    return this.usersService.findOne(email);
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
