import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

/**
 * Creates an embedded zero-dependency static file server with request telemetry.
 * @param {string} rootDir
 * @param {number} port
 * @param {(msg: string) => void} onLog
 * @param {(reqData: any) => void} onRequest
 * @returns {Promise<{ server: http.Server, port: number }>}
 */
export function startStaticServer(rootDir, port = 5000, onLog = () => {}, onRequest = () => {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const startTime = Date.now();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

      res.on('finish', () => {
        onRequest({
          method: req.method,
          path: req.url,
          status: res.statusCode,
          durationMs: Date.now() - startTime,
          clientIp
        });
      });

      let decodedPath;
      try {
        decodedPath = decodeURIComponent(req.url.split('?')[0]);
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('400 Bad Request: Malformed URI');
        return;
      }

      if (decodedPath.includes('\0')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('400 Bad Request');
        return;
      }

      const normalizedRoot = path.resolve(rootDir);
      let filePath = path.resolve(normalizedRoot, '.' + path.sep + decodedPath);

      if (!filePath.startsWith(normalizedRoot + path.sep) && filePath !== normalizedRoot) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }

      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          filePath = path.join(filePath, 'index.html');
        }

        if (!fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase();
          // SPA fallback only for directory-style/extensionless routes
          if (!ext && fs.existsSync(path.join(normalizedRoot, 'index.html'))) {
            filePath = path.join(normalizedRoot, 'index.html');
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        const fileStream = fs.createReadStream(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        fileStream.pipe(res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Internal Server Error: ${err.message}`);
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        startStaticServer(rootDir, port + 1, onLog, onRequest).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });

    server.listen(port, '0.0.0.0', () => {
      const actualPort = server.address().port;
      onLog(`Embedded static web server active on http://localhost:${actualPort}`);
      resolve({ server, port: actualPort });
    });
  });
}
