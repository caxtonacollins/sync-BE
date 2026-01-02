import { Body, Controller, Param, Post, Get, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { MintTokenDto } from 'src/types/dto/contract';
import { RequestWithUser } from 'src/types';
import { TXContractService } from 'src/contract/services/tx.service';
import { TransferTokenDto } from 'src/types/dto/transfer/create-transfer.dto';

@Controller('token')
export class Erc20TokenController {
  constructor(private readonly contractService: TokenContractService, private readonly txContractService: TXContractService) { }

  @Post('mint-token')
  async mintToken(
    @Body() mintTokenDto: MintTokenDto
  ): Promise<{ transaction_hash: string }> {
    try {
      const { transactionHash } = await this.contractService.mintToken(
        mintTokenDto.receiverAddress,
        mintTokenDto.amount,
        mintTokenDto.syncTokenAddress,
      );
      return { transaction_hash: transactionHash };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  @Get('balance/:userAddress/:symbol')
  async getAccountBalance(
    @Param('userAddress') userAddress: string,
    @Param('symbol') symbol: string,
  ) {
    return await this.contractService.getAccountBalance(symbol, userAddress);
  }

  @Post('transfer-token')
  @UseGuards(JwtAuthGuard)
  async transferToken(
    @Req() req: RequestWithUser,
    @Body() transferTokenDto: TransferTokenDto,
  ): Promise<{ result: any; transaction: any }> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    try {
      return await this.contractService.transferTokenWithUserCredentials(
        req.user.userId,
        transferTokenDto.toAddress,
        transferTokenDto.amount,
        transferTokenDto.tokenSymbol,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  }

  @Post('estimate-fee')
  @UseGuards(JwtAuthGuard)
  async estimateTransferFee(
    @Req() req: RequestWithUser,
    @Body() estimateFeeDto: {
      contractAddress: string,
      entrypoint: string,
      calldata: any[],
    }
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    try {
      return await this.txContractService.estimateTransactionFee(
        estimateFeeDto.contractAddress,
        estimateFeeDto.entrypoint,
        estimateFeeDto.calldata,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
