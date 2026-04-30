import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'defi-analyzer-jwt-secret-key-2026'
);

const COOKIE_NAME = 'session_token';
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24 hours

export interface SessionPayload {
  authenticated: boolean;
  iat: number;
  exp: number;
}

/**
 * Verify a plaintext password against the stored hash.
 * Priority: settings.json > env USER_PASSWORD_HASH
 */
export async function verifyPassword(password: string): Promise<boolean> {
  // Try settings.json first, then env
  let passwordHash: string | undefined;
  try {
    const { getPasswordHash } = await import('@/lib/storage/settings');
    passwordHash = await getPasswordHash();
  } catch {
    // Fallback to env if settings module fails
  }
  if (!passwordHash) {
    passwordHash = process.env.USER_PASSWORD_HASH;
  }

  if (!passwordHash) {
    console.error('No password configured (neither settings.json nor USER_PASSWORD_HASH env)');
    return false;
  }

  // If the hash starts with $2, it's a bcrypt hash - use bcrypt comparison
  if (passwordHash.startsWith('$2')) {
    try {
      const bcrypt = await import('bcryptjs');
      return await bcrypt.compare(password, passwordHash);
    } catch {
      return false;
    }
  }

  // Otherwise, direct string comparison (for development with plain text password)
  return password === passwordHash;
}

/**
 * Hash a password using bcrypt (for initialization / setup)
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 10);
}

/**
 * Create a new session by signing a JWT and setting an httpOnly cookie
 */
export async function createSession(): Promise<string> {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return token;
}

/**
 * Verify a JWT token string and return the payload if valid
 */
export async function verifySession(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.authenticated === true;
  } catch {
    return false;
  }
}

/**
 * Get the session token from cookies
 */
export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return token ?? null;
}

/**
 * Check if the current request is from an authenticated user
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getSession();
  if (!token) return false;
  return verifySession(token);
}

/**
 * Destroy the current session by clearing the session cookie
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
