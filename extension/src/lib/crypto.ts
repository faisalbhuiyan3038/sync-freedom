/**
 * crypto.ts — AES-256-GCM encryption + PBKDF2 key derivation
 *
 * All operations use the browser-native Web Crypto API (crypto.subtle).
 * No external dependencies.
 */

export interface EncryptedBlob {
  /** Initialization vector, 12 bytes, base64 encoded */
  iv: string;
  /** AES-256-GCM ciphertext, base64 encoded */
  ciphertext: string;
}

export interface DerivedKeyBundle {
  key: CryptoKey;
  /** Salt used for derivation, base64 encoded — must be stored alongside encrypted data */
  salt: string;
}

// ─── Key derivation ───────────────────────────────────────────────────

/**
 * Derive an AES-256-GCM key from a user passphrase using PBKDF2.
 * @param passphrase  Plain-text passphrase entered by the user.
 * @param saltB64     Optional base64-encoded salt. If not provided, a new random salt is generated.
 */
export async function deriveKey(
  passphrase: string,
  saltB64?: string,
): Promise<DerivedKeyBundle> {
  const salt = saltB64
    ? base64ToBuffer(saltB64)
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 200_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return { key, salt: bufferToBase64(salt) };
}

// ─── Encrypt / decrypt ────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string and return an EncryptedBlob.
 */
export async function encryptString(
  key: CryptoKey,
  plaintext: string,
): Promise<EncryptedBlob> {
  return encryptBuffer(key, new TextEncoder().encode(plaintext));
}

/**
 * Encrypt arbitrary binary data and return an EncryptedBlob.
 */
export async function encryptBuffer(
  key: CryptoKey,
  data: Uint8Array,
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );
  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt an EncryptedBlob back to a UTF-8 string.
 */
export async function decryptString(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<string> {
  const buf = await decryptBuffer(key, blob);
  return new TextDecoder().decode(buf);
}

/**
 * Decrypt an EncryptedBlob back to raw bytes.
 */
export async function decryptBuffer(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<Uint8Array> {
  const iv = base64ToBuffer(blob.iv);
  const ciphertext = base64ToBuffer(blob.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new Uint8Array(plaintext);
}

/**
 * Serialize an EncryptedBlob to a compact JSON string ready for storage upload.
 */
export function serializeBlob(blob: EncryptedBlob): string {
  return JSON.stringify(blob);
}

/**
 * Deserialize a stored JSON string back to an EncryptedBlob.
 */
export function deserializeBlob(raw: string): EncryptedBlob {
  const parsed = JSON.parse(raw) as EncryptedBlob;
  if (!parsed.iv || !parsed.ciphertext) {
    throw new Error('Invalid EncryptedBlob format');
  }
  return parsed;
}

// ─── Helpers ──────────────────────────────────────────────────────────

export function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
