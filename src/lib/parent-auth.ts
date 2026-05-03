import { jwtVerify, SignJWT } from 'jose';

const secret = () =>
  new TextEncoder().encode(process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me');

export interface ParentJWTPayload {
  parentEmail: string;
}

export async function signParentJWT(payload: ParentJWTPayload): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(secret());
}

export async function verifyParentJWT(token: string): Promise<ParentJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as ParentJWTPayload;
  } catch (err: any) {
    const reason = err?.code ?? err?.message ?? String(err);
    console.error('[parent-auth] JWT verification failed:', reason);
    return null;
  }
}

export const PARENT_COOKIE_NAME = 'parent_session';
export const PARENT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
};
