import { describe, it, expect } from 'vitest';
import { getAgentCard } from './helpers.js';

describe('E2E: Agent Card Discovery', () => {
  it('fetches agent card successfully', async () => {
    const card = await getAgentCard();
    expect(card.name).toBeDefined();
    expect(card.description).toBeDefined();
  });

  it('agent card has v1.0 supportedInterfaces', async () => {
    const card = await getAgentCard();
    expect(card.supportedInterfaces).toBeDefined();
    expect(card.supportedInterfaces.length).toBeGreaterThan(0);
    expect(card.url).toBeUndefined(); // no top-level url (v0.3 pattern)
  });

  it('supportedInterfaces contains JSONRPC binding', async () => {
    const card = await getAgentCard();
    expect(card.supportedInterfaces[0].protocolBinding).toBe('JSONRPC');
  });

  it('protocolVersion is "1.0"', async () => {
    const card = await getAgentCard();
    expect(card.supportedInterfaces[0].protocolVersion).toBe('1.0');
  });

  it('agent card name contains OpenClaw', async () => {
    const card = await getAgentCard();
    expect(card.name).toContain('OpenClaw');
  });

  it('agent card declares streaming capability', async () => {
    const card = await getAgentCard();
    expect(card.capabilities.streaming).toBe(true);
  });

  it('agent card has at least one skill', async () => {
    const card = await getAgentCard();
    expect(card.skills.length).toBeGreaterThan(0);
  });
});
