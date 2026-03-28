// Agent Card builder — v1.0 format

import { AgentCard } from './types/agent-card.js';

declare const __PKG_VERSION__: string;

export interface AgentCardConfig {
  publicUrl: string;
}

export function buildAgentCard(config: AgentCardConfig): AgentCard {
  return {
    name: 'OpenClaw A2A Bridge',
    description: 'A2A v1.0 bridge to OpenClaw AI assistant gateway',
    version: typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.1.0-beta.1',
    provider: {
      organization: 'OpenClaw',
      url: 'https://github.com/freema/openclaw-a2a',
    },
    supportedInterfaces: [
      {
        url: config.publicUrl,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      },
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'openclaw-chat',
        name: 'OpenClaw Chat',
        description: 'Chat with OpenClaw AI assistant',
        tags: ['chat', 'ai', 'assistant'],
        examples: ['Hello!', 'What can you help me with?'],
      },
    ],
  };
}
