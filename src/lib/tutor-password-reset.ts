import { randomUUID } from 'crypto';

export function generateResetToken(): string {
  return randomUUID();
}

export const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
export const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes between requests
export const MIN_PASSWORD_LENGTH = 8;
