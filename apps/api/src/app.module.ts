import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './database/prisma.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { AuthModule } from './auth/auth.module.js';
import { QueueModule } from './queue/queue.module.js';
import { SecurityModule } from './security/security.module.js';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    SecurityModule,
    AuthModule,
    WorkflowsModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,
  ],
})
export class AppModule {}
