import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';
import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { env } from '../config/env';

// Derive a 32-byte key from the env string at module load so every call shares one buffer
const encryptionKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'utf8').slice(0, 32);

export interface JwtPayload {
  sub: string;
  githubLogin: string;
  jti: string;
  iat: number;
  exp: number;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptToken(ciphertext: string): string {
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function signJwt(payload: { sub: string; githubLogin: string }): string {
  return jwt.sign(
    { ...payload, jti: randomUUID() },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' },
  );
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export { JsonWebTokenError, TokenExpiredError };
