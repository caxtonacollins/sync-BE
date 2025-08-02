import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Enable2FADto, Verify2FADto } from './dto/enable-2fa.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';

interface JwtUser {
  sub: string;
  email: string;
}

interface RequestWithUser extends Request {
  user: JwtUser;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      loginDto,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('2fa/generate')
  async generate2FA(@Req() req: RequestWithUser) {
    return this.authService.generate2FASecret(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  async enable2FA(
    @Req() req: RequestWithUser,
    @Body() enable2FADto: Enable2FADto,
  ) {
    return this.authService.enable2FA(req.user.sub, enable2FADto.otpCode);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  async verify2FA(
    @Req() req: RequestWithUser,
    @Body() verify2FADto: Verify2FADto,
  ) {
    return this.authService.verify2FA(req.user.sub, verify2FADto.otpCode);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  async disable2FA(@Req() req: RequestWithUser) {
    return this.authService.disable2FA(req.user.sub);
  }
}
