// Agent Card builder — v1.0 format (global + per-instance/multi-tenant + signed)

import { InstanceConfig } from '../config/index.js';
import { CardSigner } from './card-signer.js';
import { AgentCard, AgentInterface, AgentSkill } from './types/agent-card.js';

declare const __PKG_VERSION__: string;

export interface AgentCardConfig {
  publicUrl: string;
  /** When set, produces a tenant-scoped card for a single instance. */
  instance?: InstanceConfig;
  /** When set (and >1), the global card advertises each instance as a skill + tenant interface. */
  instances?: InstanceConfig[];
  /** When true, declares a bearer security scheme on the card. */
  authRequired?: boolean;
}

const VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.1.0-beta.1';

export function buildAgentCard(config: AgentCardConfig): AgentCard {
  const card = config.instance
    ? buildInstanceCard(config.publicUrl, config.instance)
    : buildGlobalCard(config.publicUrl, config.instances);

  if (config.authRequired) {
    card.securitySchemes = { bearer: { type: 'http', scheme: 'bearer' } };
    card.security = [{ bearer: [] }];
  }

  return card;
}

/** Build a card and attach a detached JWS signature. */
export function buildSignedAgentCard(config: AgentCardConfig, signer: CardSigner): AgentCard {
  const card = buildAgentCard(config);
  card.signatures = [signer.sign(card)];
  return card;
}

function buildGlobalCard(publicUrl: string, instances?: InstanceConfig[]): AgentCard {
  const multiTenant = !!instances && instances.length > 1;

  const interfaces: AgentInterface[] = [
    { url: publicUrl, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
  ];
  const skills: AgentSkill[] = [baseSkill()];

  if (multiTenant) {
    for (const inst of instances!) {
      interfaces.push({
        url: publicUrl,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
        tenant: inst.name,
      });
      skills.push(instanceSkill(inst.name));
    }
  }

  return {
    name: 'OpenClaw A2A Bridge',
    description: 'A2A v1.0 bridge to OpenClaw AI assistant gateway',
    version: VERSION,
    provider: {
      organization: 'OpenClaw',
      url: 'https://github.com/freema/openclaw-a2a',
    },
    supportedInterfaces: interfaces,
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills,
  };
}

function buildInstanceCard(publicUrl: string, instance: InstanceConfig): AgentCard {
  return {
    name: `OpenClaw A2A Bridge — ${instance.name}`,
    description: `A2A v1.0 bridge to the "${instance.name}" OpenClaw instance`,
    version: VERSION,
    provider: {
      organization: 'OpenClaw',
      url: 'https://github.com/freema/openclaw-a2a',
    },
    supportedInterfaces: [
      {
        url: publicUrl,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
        tenant: instance.name,
      },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [instanceSkill(instance.name)],
  };
}

function baseSkill(): AgentSkill {
  return {
    id: 'openclaw-chat',
    name: 'OpenClaw Chat',
    description: 'Chat with OpenClaw AI assistant',
    tags: ['chat', 'ai', 'assistant'],
    examples: ['Hello!', 'What can you help me with?'],
  };
}

function instanceSkill(name: string): AgentSkill {
  return {
    id: `openclaw-chat-${name}`,
    name: `OpenClaw Chat (${name})`,
    description: `Chat with the "${name}" OpenClaw instance (send with metadata.instance="${name}")`,
    tags: ['chat', 'ai', 'assistant', name],
    examples: ['Hello!', `What can the ${name} instance help with?`],
  };
}
