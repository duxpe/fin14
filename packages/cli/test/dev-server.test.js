import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createSsePool } from '../dev-server/sse.js';
import { startServer } from '../dev-server/server.js';

function mockRes() {
  const written = [];
  let closed = false;
  const listeners = {};
  return {
    writeHead: () => {},
    write: (chunk) => { written.push(chunk); return true },
    end: () => { closed = true },
    on: (event, fn) => { listeners[event] = fn },
    _written: written,
    _closed: () => closed,
    _emit: (event) => listeners[event]?.(),
  };
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { agent: false }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const mockState = { summary: null };

// SSE tests

test('connect — response has correct Content-Type header', () => {
  const pool = createSsePool();
  const headers = {};
  const res = mockRes();
  res.writeHead = (status, hdrs) => { Object.assign(headers, hdrs); };
  pool.connect(res);
  assert.ok(headers['Content-Type'].includes('text/event-stream'));
  pool.close();
});

test('broadcast + size — after connect, size() = 1', () => {
  const pool = createSsePool();
  const res = mockRes();
  pool.connect(res);
  assert.equal(pool.size(), 1);
  pool.close();
});

test('broadcast summary — data written to response contains event: summary', () => {
  const pool = createSsePool();
  const res = mockRes();
  pool.connect(res);
  pool.broadcast('summary', { pages: 1, pass: 1, warn: 0, fail: 0, topAssets: [] });
  const all = res._written.join('');
  assert.ok(all.includes('event: summary'), 'expected event: summary in output');
  pool.close();
});

test('new connect after broadcast — gets lastSummary immediately', () => {
  const pool = createSsePool();
  const summary = { pages: 2, pass: 2, warn: 0, fail: 0, topAssets: [] };
  pool.broadcast('summary', summary);
  const res = mockRes();
  pool.connect(res);
  const all = res._written.join('');
  assert.ok(all.includes('event: summary'), 'expected lastSummary sent on connect');
  pool.close();
});

test('after response close event fires — client removed from pool (size() = 0)', () => {
  const pool = createSsePool();
  const res = mockRes();
  pool.connect(res);
  assert.equal(pool.size(), 1);
  res._emit('close');
  assert.equal(pool.size(), 0);
  pool.close();
});

test('close() — calls end on all responses', () => {
  const pool = createSsePool();
  const res = mockRes();
  pool.connect(res);
  pool.close();
  assert.ok(res._closed(), 'expected res.end() to be called');
});

// Server tests

test('GET / returns 200 with text/html content-type', async () => {
  const pool = createSsePool();
  const srv = await startServer(pool, mockState);
  try {
    const r = await httpGet(`http://127.0.0.1:${srv.port}/`);
    assert.equal(r.status, 200);
    assert.ok(r.headers['content-type'].includes('text/html'));
  } finally {
    await srv.close();
    pool.close();
  }
});

test('GET /nonexistent returns 404', async () => {
  const pool = createSsePool();
  const srv = await startServer(pool, mockState);
  try {
    const r = await httpGet(`http://127.0.0.1:${srv.port}/nonexistent`);
    assert.equal(r.status, 404);
  } finally {
    await srv.close();
    pool.close();
  }
});

test('GET /favicon.ico returns 204', async () => {
  const pool = createSsePool();
  const srv = await startServer(pool, mockState);
  try {
    const r = await httpGet(`http://127.0.0.1:${srv.port}/favicon.ico`);
    assert.equal(r.status, 204);
  } finally {
    await srv.close();
    pool.close();
  }
});

test('port fallback — occupies 4214, server binds to 4215', async () => {
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(4214, '127.0.0.1', resolve);
  });
  const pool = createSsePool();
  let srv;
  try {
    srv = await startServer(pool, mockState);
    assert.equal(srv.port, 4215);
  } finally {
    if (srv) await srv.close();
    pool.close();
    await new Promise(resolve => blocker.close(resolve));
  }
});

test('path traversal rejected — GET /../../etc/passwd is blocked', async () => {
  const pool = createSsePool();
  const srv = await startServer(pool, mockState);
  try {
    let blocked = false;
    try {
      const r = await httpGet(`http://127.0.0.1:${srv.port}/../../etc/passwd`);
      blocked = r.status === 404 || r.status === 403;
    } catch (e) {
      blocked = e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED';
    }
    assert.ok(blocked, 'expected path traversal to be blocked');
  } finally {
    await srv.close();
    pool.close();
  }
});
