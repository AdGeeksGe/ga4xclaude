/**
 * One-time script to get a Google OAuth2 refresh token.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy npx tsx scripts/get-refresh-token.ts
 *
 * Opens your browser, you sign in and authorize, and the token is printed.
 */

import { OAuth2Client } from 'google-auth-library';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const REDIRECT_PORT = 3847;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/analytics.edit',
  ],
});

// Start a temporary local server to receive the OAuth callback
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '', REDIRECT_URI);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h2>Authorization failed</h2><p>${error}</p><p>You can close this tab.</p>`);
      console.error(`\nAuthorization failed: ${error}`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h2>No authorization code received</h2><p>You can close this tab.</p>');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Success! You can close this tab.</h2><p>Check your terminal for the refresh token.</p>');

    console.log('\n=== SUCCESS ===\n');
    console.log('Your refresh token:\n');
    console.log(tokens.refresh_token);
    console.log('\nAdd this to your .env file as GOOGLE_REFRESH_TOKEN');

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h2>Error exchanging code</h2><p>Check your terminal.</p>');
    console.error('\nFailed to exchange code for token:', (err as Error).message);
    server.close();
    process.exit(1);
  }
});

server.listen(REDIRECT_PORT, () => {
  console.log(`\nListening on ${REDIRECT_URI} for OAuth callback...\n`);
  console.log('Opening browser for Google sign-in...\n');

  // Open browser (macOS)
  exec(`open "${authUrl}"`);
});
