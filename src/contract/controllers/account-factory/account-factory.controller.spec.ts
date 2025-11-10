import { Test, TestingModule } from '@nestjs/testing';
import { AccountFactoryController } from './account-factory.controller';

describe('AccountFactoryController', () => {
  let controller: AccountFactoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountFactoryController],
    }).compile();

    controller = module.get<AccountFactoryController>(AccountFactoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
