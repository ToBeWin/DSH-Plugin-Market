import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { listInstalledPlugins, resolveDshHome, setPluginEnabled } from './profile.js';
import { runOfficialDshPlugin } from './operations.js';

export interface MarketServerOptions {
  profile: string;
  home?: string;
  port?: number;
}

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let content = '';
  for await (const chunk of request) {
    content += chunk.toString();
    if (content.length > 32_768) throw new Error('Request body is too large');
  }
  if (!content) return {};
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object');
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`);
  return value.trim();
}

function sendStatic(pathname: string, response: ServerResponse): void {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (relative.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(relative)) {
    json(response, 404, { ok: false, error: 'Not found' });
    return;
  }
  try {
    const content = readFileSync(join(PUBLIC_DIR, relative));
    response.writeHead(200, { 'content-type': MIME[extname(relative)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(content);
  } catch {
    json(response, 404, { ok: false, error: 'Not found' });
  }
}

/** Start the local-only dashboard. It never binds to a network interface. */
export async function startMarketServer(options: MarketServerOptions): Promise<{ url: string; close(): Promise<void> }> {
  const home = resolveDshHome(options.home);
  const profile = options.profile;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/context') {
        json(response, 200, { ok: true, value: { profile, home } });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/inventory') {
        json(response, 200, { ok: true, value: listInstalledPlugins(profile, home) });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/enabled') {
        const body = await readBody(request);
        const name = stringValue(body.name, 'name')!;
        if (typeof body.enabled !== 'boolean') throw new Error('enabled must be true or false');
        const plugin = setPluginEnabled(profile, name, body.enabled, home);
        json(response, 200, { ok: true, value: plugin });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/operation') {
        const body = await readBody(request);
        const action = stringValue(body.action, 'action')!;
        if (action !== 'add' && action !== 'update' && action !== 'remove') throw new Error('Unsupported operation');
        if (action === 'remove' && body.confirm !== true) throw new Error('Removal requires explicit confirmation');
        const result = await runOfficialDshPlugin({
          action,
          subject: stringValue(body.subject, 'subject', action === 'update' ? false : true),
          profile,
          home,
        });
        json(response, result.code === 0 ? 200 : 422, { ok: result.code === 0, value: result });
        return;
      }
      if (request.method === 'GET') return sendStatic(url.pathname, response);
      json(response, 405, { ok: false, error: 'Method not allowed' });
    } catch (error) {
      json(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 39183, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to resolve local server address');
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
