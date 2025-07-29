import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOauthGuard } from 'src/guards/google-oauth.guard';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

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
  @Get('google')
  @UseGuards(GoogleOauthGuard)
  async auth() {}

  @Get('google/callback')
  @UseGuards(GoogleOauthGuard)
  async googleAuthCallback(@Req() req, @Res() res: Response) {
    const frontEndRedirectUrl = this.configService.getOrThrow(
      'FRONT_END_GOOGLE_REDIRECT_URL',
    );
    try {
      const user = req?.user;

      // If No User Found from Google OAuth
      if (!user) {
        throw new BadRequestException('No User Found!');
      }
      // Checking User With Existing Records!
      let checkUser = await this.authService.checkUserWithEmail(user.email);

      // Creating New User If Doesn't Exists!
      if (!checkUser) {
        checkUser = await this.authService.createNewUser(user);
      }

      // Generating JWT Token!
      const token = await this.authService.login(checkUser);

      return res.redirect(
        `${frontEndRedirectUrl}?access_token=${token.data.access_token}`,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      return res.redirect(`${frontEndRedirectUrl}?error=oauth_failed`);
    }
  }
}
