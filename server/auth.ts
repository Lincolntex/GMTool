import 'dotenv/config';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'gmtool_gm';
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const passphrase = process.env.GM_PASSPHRASE || 'gm-alpha';
const secret = process.env.GM_SECRET || crypto.randomBytes(32).toString('hex');

function sign(value: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function checkPassphrase(input: string): boolean {
  const inputHash = crypto.createHash('sha256').update(input).digest();
  const expectedHash = crypto.createHash('sha256').update(passphrase).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}

export function issueGmCookie(res: Response): void {
  const expiresAt = Date.now() + COOKIE_MAX_AGE_MS;
  const payload = String(expiresAt);
  const token = `${payload}.${sign(payload)}`;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

export function clearGmCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function verifyGmCookieValue(value: string | undefined): boolean {
  if (!value) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function getCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function isGmFromCookieHeader(header: string | undefined): boolean {
  return verifyGmCookieValue(getCookie(header, COOKIE_NAME));
}

export function isGmRequest(req: Request): boolean {
  return verifyGmCookieValue(req.cookies?.[COOKIE_NAME]);
}

export function requireGm(req: Request, res: Response, next: NextFunction): void {
  if (!isGmRequest(req)) {
    res.status(401).json({ error: 'GM login required.' });
    return;
  }
  next();
}

export function isDefaultPassphrase(): boolean {
  return passphrase === 'gm-alpha';
}
