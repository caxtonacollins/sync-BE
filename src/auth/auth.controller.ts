import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Enable2FADto, Verify2FADto } from './dto/enable-2fa.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MfaVerifyDto } from './dto/mfa-setup.dto';
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

  @Public()
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

  // Security Settings Endpoints
  @UseGuards(JwtAuthGuard)
  @Get('security/status')
  async getSecurityStatus(@Req() req: RequestWithUser) {
    return this.authService.getSecurityStatus(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('security/password')
  async changePassword(
    @Req() req: RequestWithUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user.sub,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/initialize')
  async initializeMfa(@Req() req: RequestWithUser) {
    return this.authService.initializeMfa(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/verify')
  async verifyMfaSetup(
    @Req() req: RequestWithUser,
    @Body() mfaVerifyDto: MfaVerifyDto,
  ) {
    return this.authService.verifyMfaSetup(
      req.user.sub,
      mfaVerifyDto.code,
      mfaVerifyDto.secret,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('security/mfa/disable')
  async disableMfa(@Req() req: RequestWithUser) {
    return this.authService.disable2FA(req.user.sub);
  }

  // Placeholder endpoints for passkey and biometric (to be implemented)
  @UseGuards(JwtAuthGuard)
  @Get('passkey/register')
  async passkeyRegister() {
    return { message: 'Passkey registration not yet implemented' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('passkey/register/verify')
  async passkeyRegisterVerify() {
    return { message: 'Passkey verification not yet implemented' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('biometric/register')
  async biometricRegister() {
    return { message: 'Biometric registration not yet implemented' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('biometric/register/verify')
  async biometricRegisterVerify() {
    return { message: 'Biometric verification not yet implemented' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('security/passkey/disable')
  async disablePasskey() {
    return { message: 'Passkey disable not yet implemented' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('security/biometric/disable')
  async disableBiometric() {
    return { message: 'Biometric disable not yet implemented' };
  }
}
