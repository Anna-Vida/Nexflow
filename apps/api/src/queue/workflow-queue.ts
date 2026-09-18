export const WORKFLOW_QUEUE = 'nexflow-workflow-executions';

export const WORKFLOW_MAX_ATTEMPTS = 3;

export type WorkflowJobData = {
  executionId: string;
  mode?: 'normal' | 'recovery';
  recoveryCount?: number;
};

export function redisConnection(worker = false) {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://.');
  }
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(database) || database < 0) {
    throw new Error('REDIS_URL database must be a non-negative integer.');
  }
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'rediss:' ? 6380 : 6379)),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: database,
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 2000,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
