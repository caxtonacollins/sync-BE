/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      const mockUser = {
        id: 'uuid-123',
        email: 'test@example.com',
        password: 'hashedpassword',
        firstName: 'Test',
        lastName: 'User',
        phoneNumber: null,
        role: 'USER',
        status: 'ACTIVE',
        verificationStatus: 'UNVERIFIED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const createUserDto = {
        email: 'test@example.com',
        password: 'password',
        firstName: 'Test',
        lastName: 'User',
      };
      // Mock hashPassword and prisma.user.create
      jest.spyOn(service, 'hashPassword').mockResolvedValue('hashedpassword');
      service['prisma'] = {
        user: {
          create: jest.fn().mockResolvedValue(mockUser),
        },
      } as any;
      const result = await service.createUser(createUserDto as any);
      expect(result).toEqual(mockUser);
      expect(service['prisma'].user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: createUserDto.email,
          password: 'hashedpassword',
          firstName: createUserDto.firstName,
          lastName: createUserDto.lastName,
        }),
      });
    });
  });
});
