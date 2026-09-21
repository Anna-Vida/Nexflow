import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './database/prisma.service.js';
import { WorkflowQueueService } from './queue/workflow-queue.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly queue: WorkflowQueueService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'nexflow-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.queue.ping()]);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('NexFlow dependencies are unavailable.');
    }
  }
}
