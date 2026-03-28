// Express server — health, instances, A2A routes

import express from 'express';
import { AppConfig } from '../config/index.js';
import { OpenClawExecutor } from '../a2a/executor.js';
import { createA2ARouter } from '../a2a/router.js';
import { InMemoryTaskStore } from '../a2a/task-store.js';
import { log } from '../utils/logger.js';

export function createApp(config: AppConfig) {
  const app = express();
  const taskStore = new InMemoryTaskStore();
  const executor = new OpenClawExecutor(config, taskStore);

  // Middleware
  app.use(express.json({ limit: '10mb' }));

  // Health
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '0.1.0-beta.1',
      a2aVersion: '1.0',
      uptime: process.uptime(),
    });
  });

  // Instance info (no tokens exposed)
  app.get('/instances', (_req, res) => {
    res.json(
      config.instances.map((i) => ({
        name: i.name,
        url: i.url,
        default: i.default ?? false,
      }))
    );
  });

  // Mount A2A router
  app.use(createA2ARouter(config, taskStore, executor));

  return { app, taskStore, executor };
}

export function startServer(config: AppConfig) {
  const { app } = createApp(config);

  const server = app.listen(config.port, config.host, () => {
    log('Server started', {
      port: config.port,
      host: config.host,
      publicUrl: config.publicUrl,
      instances: config.instances.length,
    });
    log(`Agent Card: ${config.publicUrl}/.well-known/agent-card.json`);
    log(`A2A endpoint: ${config.publicUrl}/a2a`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log(`Received ${signal}, shutting down...`);
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
    // Force close after 10s
    setTimeout(() => {
      log('Forced shutdown');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
