import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { validateBearerToken } from './auth.js';
import { registerAllTools } from './tools/index.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// ─── Rate limiter (sliding window, per IP) ───
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let timestamps = rateLimitMap.get(ip);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(ip, timestamps);
  }
  // Remove old entries
  while (timestamps.length > 0 && timestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return true;
  }
  timestamps.push(now);
  return false;
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap) {
    while (timestamps.length > 0 && timestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
      timestamps.shift();
    }
    if (timestamps.length === 0) {
      rateLimitMap.delete(ip);
    }
  }
}, 300_000).unref();

// ─── Helpers ───
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'ga4-mcp-server', version: '1.0.0' },
    { capabilities: { logging: {} } }
  );
  registerAllTools(server);
  return server;
}

// ─── HTTP Server ───
const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Security headers
  res.removeHeader('X-Powered-By');

  const ip = getClientIp(req);
  const url = req.url || '';
  const method = req.method || '';

  // Rate limiting
  if (isRateLimited(ip)) {
    sendJson(res, 429, { error: 'Too Many Requests', message: 'Rate limit exceeded. Max 100 requests per minute.' });
    return;
  }

  // ─── Health check ───
  if (url === '/health' && method === 'GET') {
    sendJson(res, 200, { status: 'ok', server: 'ga4-mcp', version: '1.0.0' });
    return;
  }

  // ─── MCP endpoint ───
  if (url === '/mcp') {
    if (method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed.' },
          id: null,
        })
      );
      return;
    }

    // Bearer token auth
    if (!validateBearerToken(req)) {
      sendJson(res, 401, { error: 'Unauthorized', message: 'Missing or invalid Bearer token.' });
      return;
    }

    // Parse body
    let parsedBody: unknown;
    try {
      const rawBody = await readBody(req);
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      if ((error as Error).message === 'Request body too large') {
        sendJson(res, 413, { error: 'Payload Too Large', message: 'Request body exceeds 1 MB limit.' });
      } else {
        sendJson(res, 400, { error: 'Bad Request', message: 'Invalid JSON body.' });
      }
      return;
    }

    // Stateless MCP: create server + transport per request
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }

    res.on('close', () => {
      transport.close().catch(() => {});
      mcpServer.close().catch(() => {});
    });
    return;
  }

  // ─── 404 for everything else ───
  sendJson(res, 404, { error: 'Not Found' });
});

httpServer.listen(PORT, () => {
  console.log(`GA4 MCP Server running on port ${PORT}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  httpServer.close();
  process.exit(0);
});
