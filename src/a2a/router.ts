// Express router — Agent Card + JSON-RPC endpoint

import { Router } from 'express';
import { AppConfig } from '../config/index.js';
import { buildAgentCard } from './agent-card.js';
import { OpenClawExecutor } from './executor.js';
import { createRequestHandler } from './request-handler.js';
import { InMemoryTaskStore } from './task-store.js';

export function createA2ARouter(
  config: AppConfig,
  taskStore: InMemoryTaskStore,
  executor: OpenClawExecutor
): Router {
  const router = Router();
  const handler = createRequestHandler(config, taskStore, executor);

  // Agent Card discovery — v1.0: no /v1/ prefix
  router.get('/.well-known/agent-card.json', (_req, res) => {
    res.json(buildAgentCard({ publicUrl: config.publicUrl }));
  });

  // JSON-RPC endpoint — single endpoint for all A2A operations
  router.post('/a2a', handler);

  return router;
}
