import { jwtVerify, SignJWT } from 'jose';

const secret = () => new TextEncoder().encode(process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me');

export interface TutorJWTPayload {
  tutorId: string;
  tutorName: string;
  tutorEmail: string;
  airtableId?: number; // airtable_tutor_id — baked in at login to avoid per-request DB lookup
}

export async function signTutorJWT(payload: TutorJWTPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(secret());
}

export async function verifyTutorJWT(token: string): Promise<TutorJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as TutorJWTPayload;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = 'tutor_session';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};
