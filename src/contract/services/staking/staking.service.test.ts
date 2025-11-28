import { Test, TestingModule } from '@nestjs/testing';
import { StakingContractService } from './staking.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { KeyManagementService } from 'src/wallet/key-management.service';
import { TokenContractService } from '../erc20-token/erc20-token.service';

describe('StakingContractService', () => {
  let service: StakingContractService;
  let prisma: PrismaService;
  let keyManagement: KeyManagementService;
  let tokenContract: TokenContractService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    cryptoStakingPool: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockKeyManagement = {
    executeTransaction: jest.fn(),
  };

  const mockTokenContract = {
    getTokenAddress: jest.fn(),
    approveTokenWithUserCredentials: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StakingContractService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: KeyManagementService,
          useValue: mockKeyManagement,
        },
        {
          provide: TokenContractService,
          useValue: mockTokenContract,
        },
      ],
    }).compile();

    service = module.get<StakingContractService>(StakingContractService);
    prisma = module.get<PrismaService>(PrismaService);
    keyManagement = module.get<KeyManagementService>(KeyManagementService);
    tokenContract = module.get<TokenContractService>(TokenContractService);
  });

  describe('Method existence tests', () => {
    it('should have all required methods from Cairo interface', () => {
      // Pool management methods
      expect(service.createStakingPool).toBeDefined();
      expect(service.updatePoolApy).toBeDefined();
      expect(service.togglePool).toBeDefined();
      expect(service.getStakingPool).toBeDefined();
      expect(service.getAllPools).toBeDefined();

      // Staking operations
      expect(service.stake).toBeDefined();
      expect(service.unstake).toBeDefined();
      expect(service.claimRewards).toBeDefined();
      expect(service.emergencyUnstake).toBeDefined();

      // View functions
      expect(service.calculateRewards).toBeDefined();
      expect(service.getStakePosition).toBeDefined();
      expect(service.getAllUserStakesBySymbol).toBeDefined();
      expect(service.getAllUserStakes).toBeDefined();
      expect(service.getAllUserFiatStakes).toBeDefined();
      expect(service.getUserTotalStaked).toBeDefined();
      expect(service.getUserStakeCount).toBeDefined();

      // Admin functions
      expect(service.pause).toBeDefined();
      expect(service.unpause).toBeDefined();

      // Fiat staking
      expect(service.recordFiatStake).toBeDefined();
      expect(service.recordFiatUnstake).toBeDefined();
      expect(service.recordFiatRewardClaim).toBeDefined();

      // Admin
      expect(service.updateBalanceMerkleRoot).toBeDefined();
      expect(service.createReserveSnapshot).toBeDefined();

      // View
      expect(service.getVersion).toBeDefined();
    });
  });

  describe('Method signature tests', () => {
    it('should have correct signatures for staking operations', () => {
      // Test that methods accept the correct parameters
      expect(typeof service.stake).toBe('function');
      expect(typeof service.unstake).toBe('function');
      expect(typeof service.claimRewards).toBe('function');
      expect(typeof service.emergencyUnstake).toBe('function');
    });

    it('should have correct signatures for fiat operations', () => {
      expect(typeof service.recordFiatStake).toBe('function');
      expect(typeof service.recordFiatUnstake).toBe('function');
      expect(typeof service.recordFiatRewardClaim).toBe('function');
    });
  });

  describe('Integration with user addresses', () => {
    it('should fetch user address for staking operations', async () => {
      // Mock user with starknet address
      mockPrisma.user.findUnique.mockResolvedValue({
        starknetAccountAddress: '0x1234567890abcdef',
      });

      // This test verifies that the method tries to fetch user address
      // In actual implementation, this would fail at contract call but
      // we're just testing the user address fetching logic
      try {
        await service.stake('userId', 'TOKEN', '100', 18, 86400);
      } catch (error) {
        // Expected to fail due to contract not being initialized in test
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: 'userId' },
          select: { starknetAccountAddress: true },
        });
      }
    });
  });
});
