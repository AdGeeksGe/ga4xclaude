import { IncomingMessage } from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { v1alpha } from '@google-analytics/data';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';

const { AlphaAnalyticsDataClient } = v1alpha;

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

let dataClient: BetaAnalyticsDataClient | null = null;
let alphaDataClient: InstanceType<typeof AlphaAnalyticsDataClient> | null = null;
let adminClient: AnalyticsAdminServiceClient | null = null;

export function validateBearerToken(req: IncomingMessage): boolean {
  // If no MCP_AUTH_TOKEN is configured, allow all requests
  if (!MCP_AUTH_TOKEN) return true;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  return token === MCP_AUTH_TOKEN;
}

export function getDataClient(): BetaAnalyticsDataClient {
  if (!dataClient) {
    dataClient = new BetaAnalyticsDataClient({
      authClient: oauth2Client as never,
    });
  }
  return dataClient;
}

export function getAlphaDataClient(): InstanceType<typeof AlphaAnalyticsDataClient> {
  if (!alphaDataClient) {
    alphaDataClient = new AlphaAnalyticsDataClient({
      authClient: oauth2Client as never,
    });
  }
  return alphaDataClient;
}

export function getAdminClient(): AnalyticsAdminServiceClient {
  if (!adminClient) {
    adminClient = new AnalyticsAdminServiceClient({
      authClient: oauth2Client as never,
    });
  }
  return adminClient;
}
