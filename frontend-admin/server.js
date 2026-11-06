import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = parseInt(process.env.PORT, 10) || 8003;
const distDir = path.join(__dirname, 'dist');
const LOG_FILE = 'D:\\server_logs\\8003_tasks.log';

function writeLog(msg) {
  const line = `[${new Date().toLocaleTimeString('th-TH')}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

console.log(`Preparing Production server for Employee Task Management on port ${port}...`);

const server = http.createServer((req, res) => {
  const start = Date.now();
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  let filePath = path.join(distDir, pathname);

  res.on('finish', () => {
    const ms = Date.now() - start;
    if (!pathname.startsWith('/assets/') && !pathname.endsWith('.ico') && !pathname.endsWith('.png')) {
      writeLog(`${res.statusCode >= 400 ? '⚠️' : '✅'} HTTP ${res.statusCode} ${req.method} ${pathname} (${ms}ms)`);
    }
  });

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      
      if (pathname.startsWith('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
      
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      const indexPath = path.join(distDir, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (!indexErr && indexStats.isFile()) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=0, must-revalidate',
          });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
    }
  });
});

server.listen(port, '0.0.0.0', (err) => {
  if (err) {
    writeLog(`❌ Error starting server: ${err.message || err}`);
    process.exit(1);
  }
  writeLog(`🚀 Server online on http://localhost:${port} -> taskmanagementsystem.wallcraftthailand.com`);
});
