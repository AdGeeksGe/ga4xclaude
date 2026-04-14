import { IncomingMessage } from 'node:http';
import { OAuth2Client } from 'google-auth-library';

// ─── MCP Bearer Token (optional) ───
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || null;

// ─── Google OAuth2 (user credentials) ───
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  throw new Error(
    'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN environment variables are all required'
  );
}

const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });

let cachedToken: string | null = null;
let tokenExpiry = 0;

export function validateBearerToken(req: IncomingMessage): boolean {
  if (!MCP_AUTH_TOKEN) return true;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  return token === MCP_AUTH_TOKEN;
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  const { credentials } = await oauth2Client.refreshAccessToken();
  cachedToken = credentials.access_token || '';
  // Expire 5 minutes early to be safe
  tokenExpiry = now + ((credentials.expiry_date || now + 3600_000) - now) - 300_000;
  return cachedToken;
}

const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const ALPHA_DATA_API = 'https://analyticsdata.googleapis.com/v1alpha';

export interface GoogleApiOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

export async function callAdminApi<T = unknown>(path: string, options: GoogleApiOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const { method = 'GET', body } = options;
  const resp = await fetch(`${ADMIN_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
    const error = new Error((err as { error?: { message?: string } }).error?.message || resp.statusText);
    (error as { code?: number }).code = resp.status;
    throw error;
  }
  return resp.json() as Promise<T>;
}

export async function callDataApi<T = unknown>(path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  const resp = await fetch(`${DATA_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
    const error = new Error((err as { error?: { message?: string } }).error?.message || resp.statusText);
    (error as { code?: number }).code = resp.status;
    throw error;
  }
  return resp.json() as Promise<T>;
}

export async function callAlphaDataApi<T = unknown>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const resp = await fetch(`${ALPHA_DATA_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
    const error = new Error((err as { error?: { message?: string } }).error?.message || resp.statusText);
    (error as { code?: number }).code = resp.status;
    throw error;
  }
  return resp.json() as Promise<T>;
}
