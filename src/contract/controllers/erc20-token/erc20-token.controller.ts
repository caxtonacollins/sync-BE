import { Body, Controller, Param, Post, Get } from '@nestjs/common';
import { MintTokenDto } from 'src/contract/controllers/dto';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';

@Controller('token')
export class Erc20TokenController {
    constructor(private readonly contractService: TokenContractService) { }

        @Post('mint-token')
        async mintToken(@Body() mintTokenDto: MintTokenDto) {
            return await this.contractService.mintToken(
                mintTokenDto.receiverAddress,
                mintTokenDto.amount,
                mintTokenDto.syncTokenAddress,
            );
        }
    
    @Get('balance/:userAddress/:symbol')
    async getAccountBalance(
        @Param('userAddress') userAddress: string,
        @Param('symbol') symbol: string,
    ) {
        return await this.contractService.getAccountBalance(symbol, userAddress);
    }
    }
