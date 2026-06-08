// Express router — Agent Card discovery + JWKS + JSON-RPC endpoint

import { Router } from 'express';
import { AppConfig, getInstanceByName } from '../config/index.js';
import { createAuthMiddleware } from '../server/auth.js';
import { buildSignedAgentCard } from './agent-card.js';
import { CardSigner } from './card-signer.js';
import { TaskEventRegistry } from './event-registry.js';
import { OpenClawExecutor } from './executor.js';
import { InMemoryPushNotificationStore } from './push-store.js';
import { PushNotificationSender } from './push-sender.js';
import { createRequestHandler } from './request-handler.js';
import { InMemoryTaskStore } from './task-store.js';

export interface RouterDeps {
  config: AppConfig;
  taskStore: InMemoryTaskStore;
  executor: OpenClawExecutor;
  pushStore: InMemoryPushNotificationStore;
  pushSender: PushNotificationSender;
  registry: TaskEventRegistry;
  cardSigner: CardSigner;
}

export function createA2ARouter(deps: RouterDeps): Router {
  const { config, taskStore, executor, pushStore, pushSender, registry, cardSigner } = deps;
  const router = Router();
  const handler = createRequestHandler({
    config,
    taskStore,
    executor,
    pushStore,
    pushSender,
    registry,
  });

  const authRequired = !!config.authToken;

  // Agent Card discovery — v1.0: no /v1/ prefix. Signed, lists instances as tenants.
  router.get('/.well-known/agent-card.json', (_req, res) => {
    res.json(
      buildSignedAgentCard(
        { publicUrl: config.publicUrl, instances: config.instances, authRequired },
        cardSigner
      )
    );
  });

  // JWKS — public key(s) for verifying Agent Card signatures
  router.get('/.well-known/jwks.json', (_req, res) => {
    res.json({ keys: [cardSigner.getPublicJwk()] });
  });

  // Per-instance (multi-tenant) Agent Card
  router.get('/.well-known/:instance/agent-card.json', (req, res) => {
    const instance = getInstanceByName(config, req.params.instance);
    if (!instance) {
      res.status(404).json({ error: `Unknown instance: "${req.params.instance}"` });
      return;
    }
    res.json(
      buildSignedAgentCard({ publicUrl: config.publicUrl, instance, authRequired }, cardSigner)
    );
  });

  // JSON-RPC endpoint — single endpoint for all A2A operations.
  // Auth (when configured) guards only this route; discovery stays public.
  router.post('/a2a', createAuthMiddleware(config), handler);

  return router;
}
