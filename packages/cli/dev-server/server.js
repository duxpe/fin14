import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reportUiDir = fileURLToPath(new URL('../dev-server/report-ui/', import.meta.url));

function tryListen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(port);
    });
  });
}

async function serveHtml(res, filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(reportUiDir))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let body;
  try {
    body = await fs.readFile(resolved);
  } catch {
    res.writeHead(500);
    res.end('Internal Server Error');
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res, ssePool, opts) {
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/events') {
    ssePool.connect(res);
    return;
  }

  if (req.method === 'GET' && url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    const file = path.join(reportUiDir, 'index.html');
    await serveHtml(res, file);
    return;
  }

  if (req.method === 'POST' && url === '/warnings/toggle') {
    const body = await readJsonBody(req);
    if (typeof body.code === 'string' && opts?.onToggleWarning) {
      opts.onToggleWarning(body.code);
    }
    res.writeHead(200);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
}

export async function startServer(ssePool, state, opts = {}) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, ssePool, opts).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  let port;
  for (let p = 4214; p <= 4223; p++) {
    try {
      await tryListen(server, p);
      port = p;
      break;
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }

  if (port === undefined) {
    throw new Error('no available port in range 4214–4223');
  }

  function close() {
    return new Promise((resolve, reject) => {
      server.closeAllConnections?.();
      server.close(err => (err ? reject(err) : resolve()));
    });
  }

  return { port, close };
}
