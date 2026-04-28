import { SignJWT, jwtVerify } from 'jose';

export interface StudentJWTPayload {
  studentId: string;
  studentName: string;
  studentEmail: string;
}

const SECRET = new TextEncoder().encode(
  process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me'
);

export const STUDENT_COOKIE_NAME = 'student_session';

export const STUDENT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export async function signStudentJWT(payload: StudentJWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(SECRET);
}

export async function verifyStudentJWT(token: string): Promise<StudentJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as StudentJWTPayload;
  } catch {
    return null;
  }
}
