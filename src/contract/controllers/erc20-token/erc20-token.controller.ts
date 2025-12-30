import { Body, Controller, Param, Post, Get } from '@nestjs/common';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { MintTokenDto } from 'src/types/dto/contract';

@Controller('token')
export class Erc20TokenController {
  constructor(private readonly contractService: TokenContractService) {}

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
}
