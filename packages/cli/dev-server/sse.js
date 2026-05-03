import { SSE_HEARTBEAT_MS } from './constants.js'

export function createSsePool() {
  const clients = new Set();
  let lastSummary = null;
  let eventId = 0;

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      client.write(': ping\n\n');
    }
  }, SSE_HEARTBEAT_MS);

  function sendEvent(res, name, obj) {
    const data = JSON.stringify(obj);
    const dataLines = data.split('\n').map(line => 'data: ' + line).join('\n');
    res.write('event: ' + name + '\nid: ' + eventId + '\n' + dataLines + '\n\n');
  }

  function connect(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    clients.add(res);
    res.on('close', () => clients.delete(res));
    if (lastSummary !== null) {
      sendEvent(res, 'summary', lastSummary);
    }
  }

  function broadcast(name, obj) {
    if (name === 'summary') lastSummary = obj;
    eventId++;
    for (const client of clients) {
      sendEvent(client, name, obj);
    }
  }

  function size() {
    return clients.size;
  }

  function close() {
    clearInterval(heartbeat);
    for (const client of clients) {
      client.end();
    }
    clients.clear();
  }

  return { connect, broadcast, size, close };
}
