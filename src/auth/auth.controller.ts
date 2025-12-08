import { Controller, Post, Body, UseGuards, Get, Req, Query, Res } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
// import { LoginDto } from './dto/login.dto';
// import { Enable2FADto, Verify2FADto } from './dto/enable-2fa.dto';
// import { ChangePasswordDto } from './dto/change-password.dto';
// import { MfaVerifyDto } from './dto/mfa-setup.dto';
// import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';
import { Response } from 'express';
import { ChangePasswordDto, LoginDto, Verify2FADto } from 'src/types/dto/auth';
import { Enable2FADto } from 'src/types/dto/auth/enable-2fa.dto';
import { MfaVerifyDto } from 'src/types/dto/auth/mfa-setup.dto';

interface JwtUser {
  sub: string;
  email: string;
  role: string;
}

interface RequestWithUser extends Request {
  user: JwtUser;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(
      loginDto,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown',
      res,
    );
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    return this.authService.refreshToken(refreshToken, res);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    return this.authService.logout(refreshToken, res);
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
    return this.authService.enable2FA(req.user.sub, enable2FADto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  async verify2FA(
    @Req() req: RequestWithUser,
    @Body() verify2FADto: Verify2FADto,
  ) {
    return this.authService.verify2FA(req.user.sub, verify2FADto.code);
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

  @UseGuards(JwtAuthGuard)
  @Get('passkey/register-options')
  async getPasskeyRegistrationOptions(@Req() req: RequestWithUser) {
    return this.authService.generateRegistrationOptions(req.user.sub, req.user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post('passkey/register-verify')
  async verifyPasskeyRegistration(
    @Req() req: RequestWithUser,
    @Body() body: any,
  ) {
    return this.authService.verifyRegistration(req.user.sub, body);
  }

  @Public()
  @Get('passkey/login-options')
  async getPasskeyAuthenticationOptions(
    @Req() req: Request,
    @Query('email') email: string
  ) {
    return this.authService.generateAuthenticationOptions(email);
  }

  @Public()
  @Post('passkey/login-verify')
  async verifyPasskeyAuthentication(
    @Body() body: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.verifyAuthentication(
      body,
      res,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || 'unknown',
    );
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
  async disablePasskey(@Req() req: RequestWithUser) {
    return this.authService.disablePasskey(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('security/biometric/disable')
  async disableBiometric() {
    return { message: 'Biometric disable not yet implemented' };
  }
}
