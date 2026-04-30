import { SignJWT, jwtVerify } from 'jose';

const secret = () =>
  new TextEncoder().encode(process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me');

export interface ImpersonationPayload {
  impersonation: true;
  type: 'student' | 'parent' | 'tutor';
  id: string;
}

export async function signImpersonationJWT(
  payload: Omit<ImpersonationPayload, 'impersonation'>,
): Promise<string> {
  return new SignJWT({ ...payload, impersonation: true } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(secret());
}

export async function verifyImpersonationJWT(
  token: string,
): Promise<ImpersonationPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.impersonation) return null;
    return payload as unknown as ImpersonationPayload;
  } catch {
    return null;
  }
}
