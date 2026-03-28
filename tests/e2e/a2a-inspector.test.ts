import { describe, it, expect } from 'vitest';
import { getAgentCard, sendMessage } from './helpers.js';

// Official A2A v1.0 compliance validation
// These tests verify our implementation against the spec requirements
// without depending on the a2a-inspector tool binary.
// When a2a-inspector library becomes available as an npm module,
// these can be enhanced with direct validation calls.

describe('E2E: A2A v1.0 Compliance (Inspector-style)', () => {
  describe('Agent Card validation', () => {
    it('Agent Card has required fields', async () => {
      const card = await getAgentCard();
      // Required by v1.0 spec
      expect(card.name).toBeDefined();
      expect(typeof card.name).toBe('string');
      expect(card.description).toBeDefined();
      expect(typeof card.description).toBe('string');
      expect(card.version).toBeDefined();
      expect(card.supportedInterfaces).toBeDefined();
      expect(Array.isArray(card.supportedInterfaces)).toBe(true);
      expect(card.capabilities).toBeDefined();
      expect(card.skills).toBeDefined();
      expect(Array.isArray(card.skills)).toBe(true);
    });

    it('supportedInterfaces entries have required fields', async () => {
      const card = await getAgentCard();
      for (const iface of card.supportedInterfaces) {
        expect(iface.url).toBeDefined();
        expect(typeof iface.url).toBe('string');
        expect(iface.protocolBinding).toBeDefined();
        expect(['JSONRPC', 'REST', 'GRPC']).toContain(iface.protocolBinding);
        expect(iface.protocolVersion).toBeDefined();
      }
    });

    it('skills entries have required fields', async () => {
      const card = await getAgentCard();
      for (const skill of card.skills) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
        expect(skill.description).toBeDefined();
      }
    });

    it('no deprecated v0.3 fields present', async () => {
      const card = await getAgentCard();
      // v0.3 fields that should NOT be in v1.0
      expect(card.url).toBeUndefined();
      expect(card.protocolVersion).toBeUndefined();
      expect(card.preferredTransport).toBeUndefined();
      expect(card.additionalInterfaces).toBeUndefined();
    });
  });

  describe('SendMessage response validation', () => {
    it('response is valid JSON-RPC 2.0', async () => {
      const result = await sendMessage('Inspector validation test');
      expect(result.jsonrpc).toBe('2.0');
      expect(result.id).toBeDefined();
    });

    it('result Task has required v1.0 fields', async () => {
      const result = await sendMessage('Validate task structure');
      const task = result.result;
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('string');
      expect(task.contextId).toBeDefined();
      expect(task.status).toBeDefined();
      expect(task.status.state).toBeDefined();
    });

    it('Task uses id (not taskId)', async () => {
      const result = await sendMessage('Check id field');
      expect(result.result.id).toBeDefined();
      expect(result.result.taskId).toBeUndefined();
    });

    it('TaskState is SCREAMING_SNAKE_CASE', async () => {
      const result = await sendMessage('Check enum format');
      const state = result.result.status.state;
      expect(state).toMatch(/^TASK_STATE_/);
    });

    it('Part uses field presence (no kind)', async () => {
      const result = await sendMessage('Check part format');
      if (result.result.artifacts?.length > 0) {
        const part = result.result.artifacts[0].parts[0];
        expect(part.kind).toBeUndefined();
        expect(part.text !== undefined || part.url !== undefined || part.data !== undefined).toBe(
          true
        );
      }
    });
  });
});
