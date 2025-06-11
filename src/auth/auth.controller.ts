import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() { email, password }: LoginDTO) {
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      return { message: 'Invalid credentials' };
    }
    return this.authService.login(user);
  }
  @Post('register')
  async register(@Body() payload: RegisterDTO) {
    const user = await this.authService.register(payload);
    return this.authService.login(user);
  }

  @Post('reset-password')
  async resetPassword(
    @Body('email') email: string,
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.resetUserPassword(
      email,
      currentPassword,
      newPassword,
    );
  }

  @Get('refresh-token')
  @UseGuards(AuthGuard('jwt'))
  async refreshToken(@Req() req: any) {
    return this.authService.refreshToken(req?.user || null);
  }

  @Post('set-beta-password')
  async resetBetaPassword(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.setBetaPassword(email, password);
  }
}
