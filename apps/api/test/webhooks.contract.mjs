import 'dotenv/config';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/database/prisma.service.js';

const webhook = (id, method, path) => ({
  id,
  data: {
    kind: 'webhook', title: 'Webhook', subtitle: '', category: 'TRIGGER', icon: '↗',
    config: { method, path },
  },
});

test('public webhook HTTP and persistence contract', async (t) => {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  const prisma = app.get(PrismaService);
  let workflow;
  try {
    await app.init();
    const nodes = [
      webhook('post', 'POST', '/purchase/approval'),
      webhook('get', 'GET', '/purchase/approval'),
      webhook('unrelated', 'POST', '/other'),
      {
        id: 'condition',
        data: {
          kind: 'condition', title: 'Condition', subtitle: '', category: 'LOGIC', icon: '◇',
          config: { field: 'amount', operator: 'greaterThan', value: '10000' },
        },
      },
    ];
    const edges = [
      { id: 'post-condition', source: 'post', target: 'condition' },
      { id: 'get-condition', source: 'get', target: 'condition' },
    ];
    workflow = await prisma.workflow.create({
      data: {
        name: `Webhook contract test ${randomUUID()}`,
        currentVersion: 1,
        versions: { create: { version: 1, nodes, edges } },
      },
    });
    const endpoint = `/api/hooks/${workflow.webhookToken}/purchase/approval`;
    const http = request(app.getHttpServer());

    async function checkExecution(response, method, amount, success = true) {
      assert.equal(response.body.success, success);
      assert.equal(response.body.workflowId, workflow.id);
      assert.match(response.body.executionId, /^[0-9a-f-]{36}$/);
      assert.equal(response.body.context.amount, amount);
      assert.equal(response.body.context._request.method, method);
      assert.equal(response.body.context._request.path, '/purchase/approval');
      const execution = await prisma.execution.findUniqueOrThrow({
        where: { id: response.body.executionId }, include: { events: true },
      });
      assert.equal(execution.status, success ? 'SUCCESS' : 'FAILED');
      assert.equal(execution.input.amount, amount);
      assert.deepEqual(execution.context, response.body.context);
      assert.ok(execution.completedAt);
      assert.equal(execution.events.length, response.body.events.length);
      assert.ok(execution.events.length > 0);
      assert.deepEqual(
        [...new Set(execution.events.map((event) => event.nodeId))].sort(),
        ['condition', method.toLowerCase()].sort(),
      );
      for (const event of response.body.events) {
        assert.ok(execution.events.some((stored) =>
          stored.nodeId === event.nodeId && stored.status === event.status &&
          stored.message === event.message && stored.timestamp.toISOString() === event.timestamp));
      }
    }

    await t.test('POST body becomes input; nested path executes only reachable nodes and persists results', async () => {
      const response = await http.post(endpoint).send({ amount: 15000, method: 'GET' }).expect(200);
      await checkExecution(response, 'POST', 15000);
    });
    await t.test('real GET query becomes workflow input', async () => {
      const response = await http.get(endpoint).query({ amount: 15000 }).expect(200);
      await checkExecution(response, 'GET', '15000');
    });
    await t.test('wrong token returns 404', async () => {
      await http.post(`/api/hooks/${randomUUID()}/purchase/approval`).send({}).expect(404);
      await http.post('/api/hooks/invalid/purchase/approval').send({}).expect(404);
    });
    await t.test('wrong path returns 404', async () => {
      await http.post(`/api/hooks/${workflow.webhookToken}/missing`).send({}).expect(404);
    });
    await t.test('correct path with wrong HTTP method returns 405', async () => {
      await http.put(endpoint).send({ amount: 15000 }).expect(405);
    });
    await t.test('failed workflow persists events and result', async () => {
      const response = await http.post(endpoint).send({}).expect(200);
      await checkExecution(response, 'POST', undefined, false);
    });
    await t.test('webhook with an incoming edge returns 400 without creating an execution', async () => {
      const before = await prisma.execution.count({ where: { workflowId: workflow.id } });
      await prisma.workflowVersion.update({
        where: { workflowId_version: { workflowId: workflow.id, version: 1 } },
        data: { edges: [...edges, { id: 'incoming', source: 'unrelated', target: 'post' }] },
      });
      await http.post(endpoint).send({ amount: 15000 }).expect(400);
      assert.equal(await prisma.execution.count({ where: { workflowId: workflow.id } }), before);
    });
  } finally {
    if (workflow) {
      await prisma.execution.deleteMany({ where: { workflowId: workflow.id } });
      await prisma.workflow.delete({ where: { id: workflow.id } });
    }
    await app.close();
  }
});
