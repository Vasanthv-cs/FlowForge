import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128 bits
export const DEFAULT_KEY_VERSION = 'v1';

// In-memory test key fallback specifically for unit/integration tests when no env is provided
const TEST_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export interface EncryptedPayload {
  encryptedData: string; // hex-encoded ciphertext
  iv: string;            // hex-encoded 12-byte IV
  authTag: string;       // hex-encoded 16-byte auth tag
  keyVersion: string;
}

/**
 * Resolves the 32-byte encryption key for AES-256-GCM.
 * Supports 64-character hex strings, 44-character base64 strings, or 32 raw characters.
 * Fails securely if the key is missing or invalid in production environments.
 */
export function getEncryptionKey(_keyVersion = DEFAULT_KEY_VERSION): Buffer {
  const envKey = process.env.FLOWFORGE_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;

  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[Security Error] FLOWFORGE_ENCRYPTION_KEY environment variable is required in production. Vault cannot initialize.'
      );
    }
    // Return standard deterministic 32-byte key for local test/dev environments
    return Buffer.from(TEST_KEY_HEX, 'hex');
  }

  // Support 64-character hex
  if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // Support 44-character base64
  if (envKey.length === 44 && /^[A-Za-z0-9+/=]+$/.test(envKey)) {
    const buf = Buffer.from(envKey, 'base64');
    if (buf.length === 32) return buf;
  }

  // Support raw 32-character ASCII/UTF8
  const rawBuf = Buffer.from(envKey, 'utf8');
  if (rawBuf.length === 32) {
    return rawBuf;
  }

  throw new Error(
    `[Security Error] FLOWFORGE_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters or 32 raw bytes). Provided length: ${rawBuf.length} bytes.`
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a unique, cryptographically random 96-bit IV.
 * Never reuses IVs. Produces an authenticated 128-bit tag.
 */
export function encryptSecret(plaintext: string, keyVersion = DEFAULT_KEY_VERSION): EncryptedPayload {
  if (typeof plaintext !== 'string') {
    throw new TypeError('Plaintext must be a string.');
  }

  const key = getEncryptionKey(keyVersion);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    keyVersion,
  };
}

/**
 * Decrypts ciphertext using AES-256-GCM.
 * Validates the authentication tag before returning plaintext.
 * Throws if the ciphertext has been tampered with or if the key/IV/tag is incorrect.
 */
export function decryptSecret(
  encryptedData: string,
  ivHex: string,
  authTagHex: string,
  keyVersion = DEFAULT_KEY_VERSION
): string {
  if (!encryptedData || !ivHex || !authTagHex) {
    throw new Error('Missing required encryption parameters for decryption.');
  }

  const key = getEncryptionKey(keyVersion);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`Invalid IV length: expected ${IV_LENGTH_BYTES} bytes, got ${iv.length}.`);
  }

  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH_BYTES} bytes, got ${authTag.length}.`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    throw new Error('Decryption failed: Authentication tag mismatch or corrupted ciphertext.', {
      cause: err,
    });
  }
}

/**
 * Helper to generate a fresh, secure 256-bit encryption key (64 hex characters).
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
