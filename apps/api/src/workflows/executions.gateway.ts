import {
  ConnectedSocket,
  MessageBody,
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

const subscriptionSchema = z.object({
  executionId: z.string().uuid(),
});

@WebSocketGateway({
  namespace: '/executions',
})
export class ExecutionsGateway {
  @WebSocketServer()
  server!: Server;

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
