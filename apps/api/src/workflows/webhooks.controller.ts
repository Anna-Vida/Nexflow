import {
  All,
  Body,
  Controller,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type {
  Request,
} from 'express';
import {
  WebhooksService,
} from './webhooks.service.js';

function webhookPath(
  splat:
    string | string[],
) {
  const parts =
    Array.isArray(splat)
      ? splat
      : [splat];

  return `/${parts
    .filter(Boolean)
    .join('/')}`;
}

@Controller('hooks')
export class WebhooksController {
  constructor(
    private readonly webhooks:
      WebhooksService,
  ) {}

  @All(':token/*splat')
  trigger(
    @Param('token')
    token: string,

    @Param('splat')
    splat:
      string | string[],

    @Body()
    body: unknown,

    @Query()
    query:
      Record<
        string,
        unknown
      >,

    @Req()
    request: Request,
  ) {
    return this.webhooks
      .trigger({
        token,

        method:
          request.method,

        path:
          webhookPath(
            splat,
          ),

        body,
        query,
      });
  }
}
