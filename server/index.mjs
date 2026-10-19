import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { prepareSource, MAX_INPUT_BYTES } from './source.mjs';
import { runJava, sandboxReady } from './docker.mjs';

const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;
export function createServer({ run = runJava, ready = sandboxReady } = {}) {
  let active = 0;
  const controllers = new Set();
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status, body) => { if (!res.destroyed) { res.writeHead(status); res.end(JSON.stringify(body)); } };
    // Reject web origins, including null. The custom header forces browser
    // preflight and prevents ordinary pages from submitting code to localhost.
    if (origin && !extensionOrigin.test(origin)) return reply(403, { message: 'Only the Chrome extension may use this service.' });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Java-Runner');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.url === '/health' && req.method === 'GET') {
      const available = await ready();
      return reply(available ? 200 : 503, { status: available ? 'ok' : 'unavailable', java: '21',
        message: available ? 'Java 21 sandbox ready' : '請啟動 Docker，並先執行 npm run sandbox:build。' });
    }
    if (req.url !== '/run' || req.method !== 'POST') return reply(404, { message: 'Not found' });
    if (req.headers['x-java-runner'] !== '1' || req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      return reply(403, { message: 'Expected extension JSON request.' });
    }
    if (active >= 2) return reply(429, { message: '目前有其他程式正在執行，請稍後重試。' });
    active++;
    const controller = new AbortController();
    controllers.add(controller);
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', cancel);
    res.once('close', cancel);
    try {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 256 * 1024) { reply(413, { message: '請縮小程式碼或輸入資料。' }); return; }
        chunks.push(chunk);
      }
      let data;
      let prepared;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || typeof data !== 'object') throw new Error('請傳送 Java 程式碼。');
        prepared = prepareSource(data.code);
        if (data.stdin === undefined) data.stdin = '';
        if (typeof data.stdin !== 'string' || Buffer.byteLength(data.stdin) > MAX_INPUT_BYTES) throw new Error('輸入資料上限為 8 KB。');
      } catch (error) {
        return reply(400, { message: error instanceof SyntaxError ? '無效的 JSON 資料。' : error.message });
      }
      const result = await run(prepared, data.stdin, controller.signal);
      reply(200, result);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.message === 'sandbox_timeout') return reply(200, { status: 'timeout', stdout: '', stderr: '沙箱啟動或編譯逾時，請重試。', compileOutput: '', exitCode: null, durationMs: 20000 });
      console.error('Sandbox request failed:', error.message);
      reply(503, { message: 'Java 沙箱無法啟動。請確認 Docker 正在執行，並已執行 npm run sandbox:build。' });
    } finally {
      active--;
      controllers.delete(controller);
      req.removeListener('aborted', cancel);
      res.removeListener('close', cancel);
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.on('close', () => controllers.forEach(controller => controller.abort()));
  server.stopRuns = () => controllers.forEach(controller => controller.abort());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.on('error', error => { console.error(`啟動失敗：${error.message}`); process.exitCode = 1; });
  server.listen(43123, '127.0.0.1', () => console.log('Java Runner 已啟動：127.0.0.1:43123（僅本機存取）'));
  const shutdown = () => {
    server.stopRuns();
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
