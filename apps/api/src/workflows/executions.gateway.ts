import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  Server,
  Socket,
} from 'socket.io';
import { z } from 'zod';
import type {
  ExecutionEvent,
  WorkflowExecutionResult,
} from './workflow.engine.js';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService } from '../database/prisma.service.js';

const subscriptionSchema = z.object({
  executionId: z.string().uuid(),
});

@WebSocketGateway({
  namespace: '/executions',
})
export class ExecutionsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  // The session cookie must identify the socket before it observes anything.
  async handleConnection(
    @ConnectedSocket()
    client: Socket,
  ) {
    const user = await this.auth.userFromCookie(client.handshake.headers.cookie);
    if (!user) {
      client.disconnect(true);
      return;
    }
    (client.data as { userId?: string }).userId = user.id;
  }

  @SubscribeMessage('execution:subscribe')
  async subscribe(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    body: unknown,
  ) {
    const parsed =
      subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return {
        ok: false,
        message:
          'Invalid execution ID.',
      };
    }

    const userId =
      (client.data as { userId?: string }).userId;

    if (!userId) {
      return {
        ok: false,
        message:
          'Sign in to watch executions.',
      };
    }

    // Knowing an execution ID is not enough; its workflow owner decides.
    const execution =
      await this.prisma.execution.findUnique({
        where: {
          id: parsed.data.executionId,
        },

        select: {
          ownerId: true,
        },
      });

    if (!execution || execution.ownerId !== userId) {
      return {
        ok: false,
        message:
          'Execution not found.',
      };
    }

    const room =
      this.getRoom(
        parsed.data.executionId,
      );

    await client.join(room);

    return {
      ok: true,
      executionId:
        parsed.data.executionId,
    };
  }

  emitEvent(
    executionId: string,
    event: ExecutionEvent,
  ) {
    this.server
      .to(this.getRoom(executionId))
      .emit('execution:event', {
        executionId,
        ...event,
      });
  }

  emitComplete(
    executionId: string,
    result: WorkflowExecutionResult,
  ) {
    this.server
      .to(this.getRoom(executionId))
      .emit('execution:complete', {
        executionId,
        success: result.success,
        message: result.message,
        durationMs:
          result.durationMs,
      });
  }

  private getRoom(
    executionId: string,
  ) {
    return `execution:${executionId}`;
  }
}
