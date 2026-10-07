import crypto from 'node:crypto';
import { env } from '../../config/env.js';

function encryptionKey() {
  if (env.BIOMETRIC_ENCRYPTION_KEY) return Buffer.from(env.BIOMETRIC_ENCRYPTION_KEY, 'hex');
  // Keep local development usable without another secret. Set a dedicated key before production;
  // rotating JWT_ACCESS_SECRET also rotates this derived key and requires employee re-enrollment.
  return crypto.createHash('sha256').update('vam-face-template-v1:').update(env.JWT_ACCESS_SECRET).digest();
}

export function encryptFaceTemplate(embedding) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(embedding), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: 1 };
}

export function decryptFaceTemplate(template) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(template.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(template.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(template.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

export function embeddingDistance(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 192 || right.length !== 192) return Infinity;
  let sum = 0;
  for (let index = 0; index < 192; index += 1) sum += (left[index] - right[index]) ** 2;
  return Math.sqrt(sum);
}
