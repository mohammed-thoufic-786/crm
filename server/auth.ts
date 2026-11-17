import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { RoleCode } from '../src/types.ts';

const JWT_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'REPLACE_WITH_RANDOM_64_CHAR_HEX_SECRET'
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

export interface AuthTokenPayload {
  sub: string;
  email: string;
  roleCode: RoleCode;
  fullName: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthTokenPayload;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signJwt(payload: Omit<AuthTokenPayload, 'iat' | 'exp'>, ttlSeconds = 60 * 60 * 12): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyJwt(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
  req.auth = payload;
  next();
}

export function requireRoles(...allowed: RoleCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowed.includes(req.auth.roleCode)) {
      return res.status(403).json({
        error: `Forbidden: Role '${req.auth.roleCode}' is not permitted to perform this operation.`,
      });
    }
    next();
  };
}
