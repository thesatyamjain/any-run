import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UI_DIR = path.join(__dirname, 'ui');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const staticCache = new Map();

function getCachedStaticFile(filePath, ext) {
  if (staticCache.has(filePath)) {
    return staticCache.get(filePath);
  }
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return null;
    }
    const content = fs.readFileSync(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const etag = `"${content.length}"`;
    const cached = { content, mime, etag };
    if (content.length < 5 * 1024 * 1024) {
      staticCache.set(filePath, cached);
    }
    return cached;
  } catch (_) {
    return null;
  }
}

/**
 * Creates and starts the AnyRun Web Control Server.
 * @param {import('./runner.js').ProjectRunner} runner
 * @param {number} port
 * @returns {Promise<{ server: http.Server, port: number }>}
 */
export function startControlServer(runner, port = 3737, options = {}) {
  return new Promise((resolve, reject) => {
    const clients = new Set();
    const autoExit = options.autoExit !== undefined ? options.autoExit : Boolean(process.env.ANYRUN_AUTO_EXIT);

    let hasEverConnected = false;
    let disconnectTimer = null;

    function handleClientConnected() {
      hasEverConnected = true;
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
    }

    function handleClientDisconnected() {
      if (!autoExit || !hasEverConnected) return;
      if (clients.size === 0 && !disconnectTimer) {
        disconnectTimer = setTimeout(async () => {
          if (clients.size === 0) {
            console.log('\n[AnyRun] All Web Control Center windows closed. Shutting down background process...');
            try { await runner.stop(); } catch (_) {}
            server.close();
            process.exit(0);
          }
        }, 5000);
      }
    }

    // Subscribe runner events to SSE clients
    runner.subscribe((event) => {
      const payload = `event: ${event.eventType}\ndata: ${JSON.stringify(event.payload)}\n\n`;
      for (const res of clients) {
        try {
          res.write(payload);
        } catch (e) {
          clients.delete(res);
        }
      }
    });

    // Send periodic system telemetry (RAM, Uptime) every 2 seconds
    const telemetryTimer = setInterval(() => {
      if (clients.size === 0) return;
      const stats = runner.getSystemStats();
      const payload = `event: telemetry\ndata: ${JSON.stringify(stats)}\n\n`;
      for (const res of clients) {
        try {
          res.write(payload);
        } catch (e) {
          clients.delete(res);
        }
      }
    }, 2000);

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      // Enable CORS for flexibility
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Production security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 1. SSE Events
      if (pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write(`event: status\ndata: ${JSON.stringify(runner.getState())}\n\n`);
        clients.add(res);
        handleClientConnected();

        req.on('close', () => {
          clients.delete(res);
          handleClientDisconnected();
        });
        return;
      }

      // 1b. API Browser Closed Beacon
      if (pathname === '/api/browser-closed') {
        res.writeHead(204);
        res.end();
        handleClientDisconnected();
        return;
      }

      // 1c. API Explicit Shutdown
      if (pathname === '/api/shutdown' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Shutting down AnyRun...' }));
        setTimeout(async () => {
          console.log('\n[AnyRun] Shutdown initiated via Web Control Center.');
          try { await runner.stop(); } catch (_) {}
          server.close();
          process.exit(0);
        }, 300);
        return;
      }

      // 2. API Status
      if (pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runner.getState()));
        return;
      }

      // 3. API Logs
      if (pathname === '/api/logs' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runner.logs));
        return;
      }

      // 3b. API Network Requests
      if (pathname === '/api/requests' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runner.requests));
        return;
      }

      // 4. API Scan Directory
      if (pathname === '/api/scan' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const projectPath = body.path || process.cwd();
          const config = await runner.scan(projectPath, { packageManager: body.packageManager || null });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, config }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 5. API Run
      if (pathname === '/api/run' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const projectDir = body.path || process.cwd();
          // Start asynchronously and respond immediately with current starting state
          runner.start({
            projectDir,
            portOverride: body.port ? parseInt(body.port, 10) : null,
            tunnelProvider: body.tunnel || 'auto',
            skipInstall: Boolean(body.skipInstall),
            commandOverride: body.command || null,
            packageManager: body.packageManager || null
          }).catch((e) => {
            // runner logs and state will capture this
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Launch sequence initiated' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 6. API Stop
      if (pathname === '/api/stop' && req.method === 'POST') {
        try {
          await runner.stop();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 7. API Restart
      if (pathname === '/api/restart' && req.method === 'POST') {
        try {
          runner.restart().catch(() => {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 8. API Directory Browser (for folder selection, with Windows drive support)
      if (pathname === '/api/browse' && req.method === 'GET') {
        const queryDir = url.searchParams.get('dir');

        if (queryDir === 'drives') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            current: 'This PC',
            parent: null,
            isDrivesRoot: true,
            folders: getWindowsDrives()
          }));
          return;
        }

        const targetPath = queryDir || process.cwd();
        try {
          const resolved = path.resolve(targetPath);
          if (!fs.existsSync(resolved)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Directory does not exist', fallbackDrives: getWindowsDrives() }));
            return;
          }
          const entries = fs.readdirSync(resolved, { withFileTypes: true });
          const folders = entries
            .filter(e => {
              try {
                return e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('$');
              } catch (_) {
                return false;
              }
            })
            .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));

          const parentDir = path.dirname(resolved);
          const isAtDriveRoot = parentDir === resolved;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            current: resolved,
            parent: isAtDriveRoot ? (process.platform === 'win32' ? 'drives' : '/') : parentDir,
            isDrivesRoot: false,
            folders: folders.slice(0, 100)
          }));
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            current: targetPath,
            parent: path.dirname(path.resolve(targetPath)) || (process.platform === 'win32' ? 'drives' : '/'),
            isDrivesRoot: false,
            folders: [],
            warning: `Cannot access directory: ${err.message}`,
            fallbackDrives: getWindowsDrives()
          }));
        }
        return;
      }

      // 8b. API Replay Request (ngrok-style interactive replay)
      if (pathname === '/api/replay' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const targetPort = runner.gatewayPort || runner.activePort;
          if (!targetPort || typeof targetPort !== 'number' || targetPort < 1 || targetPort > 65535) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'No active service running to replay request to' }));
            return;
          }

          const method = (body.method || 'GET').toUpperCase();
          const reqPath = body.path || '/';
          const startTime = Date.now();

          const replayReq = http.request({
            hostname: '127.0.0.1',
            port: targetPort,
            path: reqPath,
            method,
            headers: body.headers || {},
            timeout: 30000
          }, (replayRes) => {
            const durationMs = Date.now() - startTime;
            let resBody = '';
            replayRes.on('data', chunk => {
              if (resBody.length < 50000) resBody += chunk.toString();
            });
            replayRes.on('end', () => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                status: replayRes.statusCode,
                durationMs,
                responseHeaders: replayRes.headers,
                bodyPreview: resBody.slice(0, 1000)
              }));
            });
          });

          replayReq.on('timeout', () => {
            replayReq.destroy(new Error('Replay request timeout'));
          });

          replayReq.on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          });

          if (body.body) {
            replayReq.write(typeof body.body === 'string' ? body.body : JSON.stringify(body.body));
          }
          replayReq.end();
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 8c. API Locate Dropped Folder (for Browser Drag-and-Drop)
      if (pathname === '/api/locate-folder' && req.method === 'POST') {
        try {
          const body = await parseJsonBody(req);
          const folderName = body.name || body.path || '';
          const found = locateProjectFolder(folderName);
          if (found) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, path: found }));
          } else {
            const defaultDrive = getWindowsDrives()[0]?.path || (process.platform === 'win32' ? 'C:\\' : '/');
            const suggested = path.join(defaultDrive, folderName.replace(/[<>:"|?*]/g, ''));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, suggestedPath: suggested, name: folderName }));
          }
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 9. Static UI Files
      let decoded;
      try {
        decoded = decodeURIComponent(pathname);
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('400 Bad Request');
        return;
      }

      if (decoded.includes('\0')) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('400 Bad Request');
        return;
      }

      const reqFile = decoded === '/' ? 'index.html' : decoded.replace(/^[\/\\]+/, '');
      const filePath = path.resolve(UI_DIR, reqFile);

      if (!filePath.startsWith(UI_DIR + path.sep) && filePath !== path.join(UI_DIR, 'index.html')) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const cached = getCachedStaticFile(filePath, ext);
      if (cached) {
        if (req.headers['if-none-match'] === cached.etag) {
          res.writeHead(304);
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': cached.mime,
          'Content-Length': cached.content.length,
          'ETag': cached.etag,
          'Cache-Control': 'public, max-age=3600'
        });
        res.end(cached.content);
        return;
      }

      // Fallback
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    });

    server.on('close', () => {
      clearInterval(telemetryTimer);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        clearInterval(telemetryTimer);
        startControlServer(runner, port + 1).then(resolve).catch(reject);
      } else {
        clearInterval(telemetryTimer);
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort });
    });
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Malformed JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function getWindowsDrives() {
  if (process.platform !== 'win32') {
    return [{ name: 'Root (/)', path: '/' }];
  }
  const drives = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i++) {
    const drive = `${letters[i]}:\\`;
    try {
      if (fs.existsSync(drive)) {
        drives.push({ name: `Drive (${letters[i]}:)`, path: drive });
      }
    } catch (_) {}
  }
  return drives.length > 0 ? drives : [{ name: 'Drive (C:)', path: 'C:\\' }];
}

export function locateProjectFolder(folderName) {
  if (!folderName || typeof folderName !== 'string') return null;
  const cleanName = folderName.trim();
  if (!cleanName) return null;

  // Direct check if path is already existing
  try {
    const direct = path.resolve(cleanName);
    if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      return direct;
    }
  } catch (_) {}

  // Current directory itself matches
  if (path.basename(process.cwd()).toLowerCase() === cleanName.toLowerCase()) {
    return process.cwd();
  }

  const candidateDirs = [];

  // 1. Current working directory & parent/sibling
  const cwd = process.cwd();
  candidateDirs.push(path.join(cwd, cleanName));
  candidateDirs.push(path.join(path.dirname(cwd), cleanName));

  // 2. Windows Drive Roots & typical dev paths
  const drives = getWindowsDrives().map(d => d.path);
  for (const drive of drives) {
    candidateDirs.push(path.join(drive, cleanName));
    candidateDirs.push(path.join(drive, 'projects', cleanName));
    candidateDirs.push(path.join(drive, 'dev', cleanName));
    candidateDirs.push(path.join(drive, 'code', cleanName));
    candidateDirs.push(path.join(drive, 'repos', cleanName));
    candidateDirs.push(path.join(drive, 'workspace', cleanName));
  }

  // 3. User Home Directory & subfolders
  try {
    const home = os.homedir();
    candidateDirs.push(path.join(home, cleanName));
    candidateDirs.push(path.join(home, 'Desktop', cleanName));
    candidateDirs.push(path.join(home, 'Documents', cleanName));
    candidateDirs.push(path.join(home, 'Downloads', cleanName));
    candidateDirs.push(path.join(home, 'projects', cleanName));
    candidateDirs.push(path.join(home, 'repos', cleanName));
    candidateDirs.push(path.join(home, 'source', 'repos', cleanName));
  } catch (_) {}

  for (const dir of candidateDirs) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return path.resolve(dir);
      }
    } catch (_) {}
  }

  // 4. Fallback: Fast shallow scan of depth-1 subdirectories in drive roots
  for (const drive of drives) {
    try {
      const subdirs = fs.readdirSync(drive, { withFileTypes: true });
      for (const sub of subdirs) {
        if (sub.isDirectory() && !sub.name.startsWith('$') && !sub.name.startsWith('.') && sub.name !== 'Windows' && sub.name !== 'Program Files') {
          const subPath = path.join(drive, sub.name, cleanName);
          if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
            return path.resolve(subPath);
          }
        }
      }
    } catch (_) {}
  }

  return null;
}


