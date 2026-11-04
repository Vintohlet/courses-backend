import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';

describe('AppController', () => {
  let appController: AppController;
  const connection = { readyState: 1 };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: getConnectionToken(), useValue: connection }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('reports application and database availability', () => {
      expect(appController.health()).toEqual({ status: 'ok', mongo: true });
    });
  });
});
