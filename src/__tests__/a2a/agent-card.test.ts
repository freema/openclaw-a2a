import { describe, it, expect } from 'vitest';
import { buildAgentCard } from '../../a2a/agent-card.js';

describe('Agent Card Builder', () => {
  const card = buildAgentCard({ publicUrl: 'http://localhost:3100' });

  it('builds valid v1.0 agent card', () => {
    expect(card.name).toBeDefined();
    expect(card.description).toBeDefined();
    expect(card.supportedInterfaces).toBeDefined();
    expect(card.supportedInterfaces.length).toBeGreaterThan(0);
  });

  it('includes protocolVersion "1.0"', () => {
    expect(card.supportedInterfaces[0].protocolVersion).toBe('1.0');
  });

  it('includes protocolBinding "JSONRPC"', () => {
    expect(card.supportedInterfaces[0].protocolBinding).toBe('JSONRPC');
  });

  it('includes streaming capability', () => {
    expect(card.capabilities.streaming).toBe(true);
  });

  it('includes correct URL in supportedInterfaces', () => {
    expect(card.supportedInterfaces[0].url).toBe('http://localhost:3100');
  });

  it('includes at least one skill', () => {
    expect(card.skills.length).toBeGreaterThan(0);
    expect(card.skills[0].id).toBe('openclaw-chat');
  });

  it('does NOT include deprecated v0.3 fields', () => {
    expect((card as any).url).toBeUndefined();
    expect((card as any).additionalInterfaces).toBeUndefined();
    expect((card as any).protocolVersion).toBeUndefined();
    expect((card as any).preferredTransport).toBeUndefined();
  });

  it('produces JSON-serializable output', () => {
    expect(() => JSON.stringify(card)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(card));
    expect(parsed.name).toBe(card.name);
  });
});
