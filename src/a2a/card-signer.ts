// Agent Card signing — A2A v1.0 detached JWS over the canonicalized card.
//
// Uses Ed25519 (EdDSA) via Node's built-in crypto. The signature is a detached
// JWS (RFC 7515 Appendix F): the `payload` is omitted from the signature object
// because it IS the canonicalized Agent Card. Verifiers reconstruct the payload
// by canonicalizing the received card (minus `signatures`) and checking it
// against the public key published at /.well-known/jwks.json.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
  sign as cryptoSign,
} from 'node:crypto';
import { AgentCard, AgentCardSignature } from './types/agent-card.js';
import { logWarn } from '../utils/logger.js';

export interface PublicJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  kid: string;
  use: 'sig';
  alg: 'EdDSA';
}

export class CardSigner {
  private constructor(
    private readonly privateKey: KeyObject,
    private readonly publicJwk: PublicJwk
  ) {}

  /**
   * Build a signer from config. Uses A2A_CARD_SIGNING_KEY (PEM Ed25519) when set,
   * otherwise generates an ephemeral keypair (kid changes across restarts).
   */
  static fromConfig(config: { cardSigningKey?: string }): CardSigner {
    let privateKey: KeyObject;

    if (config.cardSigningKey) {
      privateKey = createPrivateKey(config.cardSigningKey);
      if (privateKey.asymmetricKeyType !== 'ed25519') {
        throw new Error(
          `A2A_CARD_SIGNING_KEY must be an Ed25519 private key (got: ${privateKey.asymmetricKeyType})`
        );
      }
    } else {
      privateKey = generateKeyPairSync('ed25519').privateKey;
      logWarn(
        'No A2A_CARD_SIGNING_KEY set — using an ephemeral Ed25519 key. ' +
          'Agent Card signatures (kid) will change on every restart; set a stable key for production.'
      );
    }

    const publicKey = createPublicKey(privateKey);
    const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string };
    const kid = jwkThumbprint(jwk.crv, jwk.kty, jwk.x);

    return new CardSigner(privateKey, {
      kty: 'OKP',
      crv: 'Ed25519',
      x: jwk.x,
      kid,
      use: 'sig',
      alg: 'EdDSA',
    });
  }

  /** Sign a card, returning a detached JWS signature object. */
  sign(card: AgentCard): AgentCardSignature {
    const { signatures: _drop, ...unsigned } = card;
    const payload = canonicalize(unsigned);

    const protectedHeader = { alg: 'EdDSA', kid: this.publicJwk.kid };
    const protectedB64 = base64url(JSON.stringify(protectedHeader));
    const payloadB64 = base64url(payload);
    const signingInput = `${protectedB64}.${payloadB64}`;

    const signature = cryptoSign(null, Buffer.from(signingInput, 'ascii'), this.privateKey);

    return {
      protected: protectedB64,
      signature: signature.toString('base64url'),
    };
  }

  /** Public key as a JWK for the JWKS endpoint. */
  getPublicJwk(): PublicJwk {
    return { ...this.publicJwk };
  }
}

// --- helpers ---

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** RFC 7638 JWK thumbprint for an OKP key, base64url(sha256(canonical members)). */
function jwkThumbprint(crv: string, kty: string, x: string): string {
  const canonical = JSON.stringify({ crv, kty, x });
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

/**
 * RFC 8785-intent JSON canonicalization. Object keys are sorted (UTF-16 code
 * unit order, which matches JCS for the ASCII keys used in Agent Cards); arrays
 * keep their order (semantic); `undefined` members are dropped. The Agent Card
 * schema is string/array/object-typed, so number edge cases do not arise.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${entries.join(',')}}`;
}
