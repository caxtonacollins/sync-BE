/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { RpcProvider, Account, Uint256 } from 'starknet';
import 'dotenv/config';
import { AccountContractService } from './account-contract.service';
import { AccountFactoryContractService } from './account-factory-contract.service';
import { LiquidityPoolContractService } from './liquidity-pool-contract.service';
import { TokenContractService } from './token-contract.service';
import {
  connectToStarknet
} from './utils';

/**
 * Main Contract Service - Orchestrates all specialized contract services
 * This service delegates to specialized services for better separation of concerns
 */
@Injectable()
export class ContractService {
  private provider: RpcProvider;
  private accountAddress: string;
  private private_key: string;

  constructor(
    private readonly accountContractService: AccountContractService,
    private readonly accountFactoryService: AccountFactoryContractService,
    private readonly liquidityPoolService: LiquidityPoolContractService,
    private readonly tokenService: TokenContractService,
  ) {
    this.provider = connectToStarknet();
    this.accountAddress = process.env.DEPLOYER_ADDRESS || '';
    this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
  }

  // ==================== Token Address Getters ====================
  public get syncTokenAddress(): string {
    return this.tokenService.syncTokenAddress;
  }

  public get strkTokenAddress(): string {
    return this.tokenService.strkTokenAddress;
  }

  public get usdcTokenAddress(): string {
    return this.tokenService.usdcTokenAddress;
  }

  public get ethTokenAddress(): string {
    return this.tokenService.ethTokenAddress;
  }

  public get btcTokenAddress(): string {
    return this.tokenService.btcTokenAddress;
  }

  // ==================== Account Contract Methods ====================
  createAccount = async (user_unique_id: string) => {
    return this.accountContractService.createAccount(user_unique_id);
  };

  getAccountAddress = async (userAddress: string) => {
    return this.accountContractService.getAccountAddress(userAddress);
  };

  getUserDashboardData = async (userAddress: string) => {
    return this.accountContractService.getUserDashboardData(userAddress);
  };

  computeAddress = () => {
    return this.accountContractService.computeAddress();
  };

  // ==================== Account Factory Methods ====================
  setAccountClassHash = async (classHash: string) => {
    return this.accountFactoryService.setAccountClassHash(classHash);
  };

  getAccountClassHash = async () => {
    return this.accountFactoryService.getAccountClassHash();
  };

  transferFactoryOwnership = async (newOwnerAddress: string) => {
    return this.accountFactoryService.transferFactoryOwnership(newOwnerAddress);
  };

  upgradeAccountFactory = async (classHash: string) => {
    return this.accountFactoryService.upgradeAccountFactory(classHash);
  };

  // ==================== Liquidity Pool Methods ====================
  registerUserToLiquidity = async (
    userContractAddress: string,
    fiatAccountId: string,
  ) => {
    return this.liquidityPoolService.registerUserToLiquidity(
      userContractAddress,
      fiatAccountId,
    );
  };

  isUserRegistered = async (userContractAddress: string) => {
    return this.liquidityPoolService.isUserRegistered(userContractAddress);
  };

  addTokenToLiquidity = async (symbol: string, amount: string) => {
    return this.liquidityPoolService.addTokenToLiquidity(symbol, amount);
  };

  addSupportedToken = async (symbol: string, address: string) => {
    return this.liquidityPoolService.addSupportedToken(symbol, address);
  };

  getTokenAmountInUsd = async (address: string) => {
    return this.liquidityPoolService.getTokenAmountInUsd(address);
  };

  swapFiatToToken = async (
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    fiatAmount: number,
    swapOrderId: string,
    tokenAmount: number,
    fee: number,
  ) => {
    const tokenAddress = this.tokenService.getTokenAddress(tokenSymbol);
    return this.liquidityPoolService.swapFiatToToken(
      userContractAddress,
      fiatSymbol,
      tokenSymbol,
      fiatAmount,
      swapOrderId,
      tokenAddress,
      tokenAmount,
      fee,
    );
  };

  swapTokenToFiat = async (
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    tokenAmount: string,
    swapOrderId: string,
  ) => {
    const tokenAddress = this.tokenService.getTokenAddress(tokenSymbol);
    return this.liquidityPoolService.swapTokenToFiat(
      userContractAddress,
      fiatSymbol,
      tokenSymbol,
      tokenAmount,
      swapOrderId,
      tokenAddress,
    );
  };

  getFeeBPS = async () => {
    return this.liquidityPoolService.getFeeBPS();
  };

  getSupportedTokenBySymbol = async (symbol: string) => {
    return this.liquidityPoolService.getSupportedTokenBySymbol(symbol);
  };

  transferLiquidityOwnership = async (newOwnerAddress: string) => {
    return this.liquidityPoolService.transferLiquidityOwnership(
      newOwnerAddress,
    );
  };

  upgradeLiquidityContract = async (classHash: string) => {
    return this.liquidityPoolService.upgradeLiquidityContract(classHash);
  };

  upgradePragmaOracleAddress = async (contractAddress: string) => {
    return this.liquidityPoolService.upgradePragmaOracleAddress(
      contractAddress,
    );
  };

  setLiquidityContractAddress = (address: string) => {
    return this.liquidityPoolService.setLiquidityContractAddress(address);
  };

  executeUserTransaction = async (userId: string, calls: any[]) => {
    return this.liquidityPoolService.executeUserTransaction(userId, calls);
  };

  approveTokenWithUserCredentials = async (
    userId: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: Uint256,
  ) => {
    return this.liquidityPoolService.approveTokenWithUserCredentials(
      userId,
      tokenAddress,
      spenderAddress,
      amount,
    );
  };

  approveTokenWithDeployerCredentials = async (
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint,
  ) => {
    return this.liquidityPoolService.approveTokenWithDeployerCredentials(
      tokenAddress,
      spenderAddress,
      amount,
    );
  };

  mintToken = async (receiverAddress: string, amount: string) => {
    return this.liquidityPoolService.mintToken(
      receiverAddress,
      amount,
      this.syncTokenAddress,
    );
  };

  // ==================== Token Contract Methods ====================
  getAccountBalance = async (symbol: string, userAddress: string) => {
    return this.tokenService.getAccountBalance(symbol, userAddress);
  };

  getMultipleAccountBalances = async (
    symbols: string[],
    userAddress: string,
  ) => {
    return this.tokenService.getMultipleAccountBalances(symbols, userAddress);
  };

  getSyncTokenBalance = async (address: string) => {
    return this.tokenService.getSyncTokenBalance(address);
  };

  getApproveTokenCalldata = (
    tokenSymbol: string,
    spenderAddress: string,
    amount: string,
  ) => {
    return this.tokenService.getApproveTokenCalldata(
      tokenSymbol,
      spenderAddress,
      amount,
    );
  };

  getTokenDecimals = async (tokenAddress: string) => {
    // Default to 18 decimals for now
    return 18;
  };

  // ==================== Deployer Wallet ====================
  getDeployerWallet = () => {
    if (!this.provider || !this.accountAddress || !this.private_key)
      throw new Error("credentials required to deploy deployer's wallet");
    return new Account(this.provider, this.accountAddress, this.private_key);
  };
}
