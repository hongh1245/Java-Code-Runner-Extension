import http from 'node:http';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./demo.html', import.meta.url));
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
});
server.listen(43124, '127.0.0.1', () => console.log('展示網頁：http://127.0.0.1:43124（先啟動 Java 服務並載入 extension/）'));
