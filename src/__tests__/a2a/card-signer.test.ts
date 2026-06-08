import { describe, it, expect } from 'vitest';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { CardSigner, canonicalize } from '../../a2a/card-signer.js';
import { buildAgentCard } from '../../a2a/agent-card.js';
import { AgentCard } from '../../a2a/types/agent-card.js';

function ed25519Pem(): string {
  const { privateKey } = generateKeyPairSync('ed25519');
  return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
}

function verifyCard(card: AgentCard, signer: CardSigner, sigSource: AgentCard): boolean {
  const sig = sigSource.signatures![0];
  const { signatures: _drop, ...unsigned } = card;
  const payloadB64 = Buffer.from(canonicalize(unsigned), 'utf8').toString('base64url');
  const signingInput = `${sig.protected}.${payloadB64}`;
  const publicKey = createPublicKey({ key: signer.getPublicJwk() as any, format: 'jwk' });
  return verify(
    null,
    Buffer.from(signingInput, 'ascii'),
    publicKey,
    Buffer.from(sig.signature, 'base64url')
  );
}

describe('CardSigner', () => {
  it('produces a detached JWS that verifies against the public JWK', () => {
    const signer = CardSigner.fromConfig({ cardSigningKey: ed25519Pem() });
    const card = buildAgentCard({ publicUrl: 'http://localhost:3100' });
    const signed: AgentCard = { ...card, signatures: [signer.sign(card)] };
    expect(verifyCard(signed, signer, signed)).toBe(true);
  });

  it('detects tampering with the card', () => {
    const signer = CardSigner.fromConfig({ cardSigningKey: ed25519Pem() });
    const card = buildAgentCard({ publicUrl: 'http://localhost:3100' });
    const signed: AgentCard = { ...card, signatures: [signer.sign(card)] };
    const tampered: AgentCard = { ...signed, name: 'Evil Card' };
    expect(verifyCard(tampered, signer, signed)).toBe(false);
  });

  it('produces a stable kid for a fixed key', () => {
    const pem = ed25519Pem();
    const a = CardSigner.fromConfig({ cardSigningKey: pem }).getPublicJwk().kid;
    const b = CardSigner.fromConfig({ cardSigningKey: pem }).getPublicJwk().kid;
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('protected header decodes to EdDSA + matching kid', () => {
    const signer = CardSigner.fromConfig({ cardSigningKey: ed25519Pem() });
    const sig = signer.sign(buildAgentCard({ publicUrl: 'http://localhost:3100' }));
    const header = JSON.parse(Buffer.from(sig.protected, 'base64url').toString('utf8'));
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe(signer.getPublicJwk().kid);
  });

  it('rejects a non-Ed25519 signing key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rsaPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    expect(() => CardSigner.fromConfig({ cardSigningKey: rsaPem })).toThrow(/Ed25519/);
  });

  it('canonicalize sorts object keys and preserves array order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalize({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});
