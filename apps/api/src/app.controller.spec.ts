import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './database/prisma.service.js';
import { WorkflowQueueService } from './queue/workflow-queue.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: async () => [{ '?column?': 1 }] } },
        { provide: WorkflowQueueService, useValue: { ping: async () => 'PONG' } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should report the API as healthy', () => {
      const result = appController.health();
      expect(result.status).toBe('ok');
      expect(result.service).toBe('nexflow-api');
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    });
  });

  describe('ready', () => {
    it('checks PostgreSQL and Redis', async () => {
      await expect(appController.ready()).resolves.toEqual({ status: 'ready' });
    });
  });
});
