import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';

import { detectProject } from '../src/detector.js';
import { extractPortFromLogs, isPortOpen } from '../src/port_sniffer.js';
import { generateTerminalQR, generateDataUrlQR, generateSvgQR } from '../src/qr.js';
import { startStaticServer } from '../src/static_server.js';

async function runTests() {
  console.log('>>> Starting AnyRun Self-Check Suite...\n');

  // 1. Port Sniffer Regex Tests
  console.log('Testing port sniffer regex extraction...');
  assert.strictEqual(extractPortFromLogs('  ➜  Local:   http://localhost:5173/'), 5173);
  assert.strictEqual(extractPortFromLogs('- Local:        http://localhost:3000'), 3000);
  assert.strictEqual(extractPortFromLogs('* Running on http://127.0.0.1:8000 (Press CTRL+C to quit)'), 8000);
  assert.strictEqual(extractPortFromLogs('INFO:     Uvicorn running on http://0.0.0.0:8080 (Press CTRL+C to quit)'), 8080);
  assert.strictEqual(extractPortFromLogs('Server listening on port 4200'), 4200);
  assert.strictEqual(extractPortFromLogs('ready - started server on 0.0.0.0:3005, url: http://localhost:3005'), 3005);
  assert.strictEqual(extractPortFromLogs('No port mentioned in this string'), null);

  // Port collision test (Vite shifting from 3000 to 3001)
  const collisionLog = `
    Port 3000 is in use, trying another one...
      VITE v6.3.5  ready in 1252 ms
      ➜  Local:   http://localhost:3001/
      ➜  Network: use --host to expose
  `;
  assert.strictEqual(extractPortFromLogs(collisionLog), 3001, 'Should extract shifted port 3001 instead of collided port 3000');
  console.log('  [PASS] Port sniffer collision extraction verified.');

  // 2. QR Code Generation Tests
  console.log('\nTesting QR code generators...');
  const testUrl = 'https://demo-tunnel.trycloudflare.com';
  const termQr = await generateTerminalQR(testUrl);
  assert.ok(termQr.length > 50, 'Terminal QR should be generated');

  const dataUrl = await generateDataUrlQR(testUrl);
  assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'DataURL should be valid PNG data URI');

  const svgQr = await generateSvgQR(testUrl);
  assert.ok(svgQr.includes('<svg'), 'SVG QR should contain valid SVG markup');
  console.log('  [PASS] QR generation (Terminal, DataURL, SVG) verified.');

  // 3. Architecture Detector Tests
  console.log('\nTesting architecture detection matrix...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anyrun-test-'));

  try {
    // 3a. Node.js Vite mock with custom port in vite.config.ts
    const nodeDir = path.join(tmpDir, 'node-vite');
    fs.mkdirSync(nodeDir);
    fs.writeFileSync(path.join(nodeDir, 'package.json'), JSON.stringify({
      name: 'mock-vite-app',
      scripts: { dev: 'vite' },
      devDependencies: { vite: '^5.0.0' }
    }));
    fs.writeFileSync(path.join(nodeDir, 'vite.config.ts'), 'export default { server: { port: 3000 } };');

    const nodeDetection = await detectProject(nodeDir);
    assert.strictEqual(nodeDetection.type, 'nodejs');
    assert.strictEqual(nodeDetection.framework, 'Vite');
    assert.strictEqual(nodeDetection.defaultPort, 3000, 'Should parse port 3000 from vite.config.ts');
    assert.strictEqual(nodeDetection.command, 'npm');
    assert.deepStrictEqual(nodeDetection.args, ['run', 'dev']);
    console.log('  [PASS] Node.js (Vite) custom port detection verified.');

    // 3a-2. Node.js pnpm mock
    const pnpmDir = path.join(tmpDir, 'node-pnpm');
    fs.mkdirSync(pnpmDir);
    fs.writeFileSync(path.join(pnpmDir, 'package.json'), JSON.stringify({
      name: 'mock-pnpm-app',
      scripts: { dev: 'next dev' },
      dependencies: { next: '^14.0.0' }
    }));
    fs.writeFileSync(path.join(pnpmDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');

    const pnpmDetection = await detectProject(pnpmDir);
    assert.strictEqual(pnpmDetection.packageManager, 'pnpm');
    assert.strictEqual(pnpmDetection.command, 'pnpm');
    assert.deepStrictEqual(pnpmDetection.args, ['run', 'dev']);
    assert.strictEqual(pnpmDetection.installCommand, 'pnpm install');

    // 3a-3. Manual package manager override
    const overrideDetection = await detectProject(pnpmDir, { packageManager: 'npm' });
    assert.strictEqual(overrideDetection.packageManager, 'npm', 'Explicit npm override must take precedence');
    assert.strictEqual(overrideDetection.command, 'npm');
    assert.strictEqual(overrideDetection.installCommand, 'npm install');

    // 3a-4. Dual lockfile timestamp arbitration
    const dualLockDir = path.join(tmpDir, 'node-dual-lock');
    fs.mkdirSync(dualLockDir);
    fs.writeFileSync(path.join(dualLockDir, 'package.json'), JSON.stringify({
      name: 'mock-dual-app',
      scripts: { start: 'node index.js' }
    }));
    const pnpmLockPath = path.join(dualLockDir, 'pnpm-lock.yaml');
    const npmLockPath = path.join(dualLockDir, 'package-lock.json');
    fs.writeFileSync(pnpmLockPath, 'lockfileVersion: 5.4');
    fs.writeFileSync(npmLockPath, '{}');
    // Set npmLock to be newer
    const now = Date.now() / 1000;
    fs.utimesSync(pnpmLockPath, now - 50, now - 50);
    fs.utimesSync(npmLockPath, now, now);

    const dualDetection = await detectProject(dualLockDir);
    assert.strictEqual(dualDetection.packageManager, 'npm', 'Newer lockfile (package-lock.json) must win arbitration');

    console.log('  [PASS] Node.js (pnpm / npm / override / arbitration) verified.');

    // 3b. Python FastAPI mock
    const pyDir = path.join(tmpDir, 'python-fastapi');
    fs.mkdirSync(pyDir);
    fs.writeFileSync(path.join(pyDir, 'main.py'), 'from fastapi import FastAPI\napp = FastAPI()\n');
    const pyDetection = await detectProject(pyDir);
    assert.strictEqual(pyDetection.type, 'python');
    assert.strictEqual(pyDetection.framework, 'FastAPI');
    assert.strictEqual(pyDetection.defaultPort, 8000);
    assert.strictEqual(pyDetection.command, process.platform === 'win32' ? 'py' : 'python3');
    assert.deepStrictEqual(pyDetection.args, ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000', '--reload']);
    console.log('  [PASS] Python (FastAPI) detection verified.');

    // 3c. Static HTML mock
    const staticDir = path.join(tmpDir, 'static-site');
    fs.mkdirSync(staticDir);
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!DOCTYPE html><h1>Hello World</h1>');
    const staticDetection = await detectProject(staticDir);
    assert.strictEqual(staticDetection.type, 'static');
    assert.strictEqual(staticDetection.isStatic, true);
    console.log('  [PASS] Static HTML detection verified.');

    // 3d. Python with local .venv detection
    const pyVenvDir = path.join(tmpDir, 'python-venv');
    fs.mkdirSync(pyVenvDir);
    const venvBinDir = process.platform === 'win32'
      ? path.join(pyVenvDir, '.venv', 'Scripts')
      : path.join(pyVenvDir, '.venv', 'bin');
    fs.mkdirSync(venvBinDir, { recursive: true });
    const dummyPython = process.platform === 'win32'
      ? path.join(venvBinDir, 'python.exe')
      : path.join(venvBinDir, 'python');
    fs.writeFileSync(dummyPython, '');
    fs.writeFileSync(path.join(pyVenvDir, 'main.py'), 'print("hello")');

    const pyVenvDetection = await detectProject(pyVenvDir);
    assert.strictEqual(pyVenvDetection.command, dummyPython, 'Should detect local virtualenv python binary');
    console.log('  [PASS] Python project-local virtual environment (.venv) detection verified.');

    // 4. Embedded Static Web Server Test & Security Hardening
    console.log('\nTesting embedded static HTTP server & security protections...');
    const { server, port } = await startStaticServer(staticDir, 18999);
    assert.ok(port > 0, 'Static server should bind to port');

    // Test normal file serve
    await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/index.html`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.headers['content-type'].includes('text/html'));
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          assert.strictEqual(data, '<!DOCTYPE html><h1>Hello World</h1>');
          resolve();
        });
      }).on('error', reject);
    });

    // Test path traversal rejection (should return 403 Forbidden)
    await new Promise((resolve, reject) => {
      const r = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/../package.json',
        method: 'GET'
      }, (res) => {
        assert.strictEqual(res.statusCode, 403, 'Path traversal should be rejected with 403');
        resolve();
      });
      r.on('error', reject);
      r.end();
    });

    // Test malformed URI rejection (should return 400 Bad Request without crashing)
    await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/%c0%af`, (res) => {
        assert.strictEqual(res.statusCode, 400, 'Malformed URI should return 400 Bad Request');
        resolve();
      }).on('error', reject);
    });

    server.close();
    console.log('  [PASS] Embedded static HTTP server and path traversal / malformed URI protections verified.');

    // 5. Control Server & API Endpoints Test
    console.log('\nTesting Web Control Server endpoints...');
    const { ProjectRunner } = await import('../src/runner.js');
    const { startControlServer } = await import('../src/server.js');
    const mockRunner = new ProjectRunner();
    mockRunner.recordRequest({ method: 'GET', path: '/api/test', status: 200, durationMs: 4 });

    const { server: ctrlServer, port: ctrlPort } = await startControlServer(mockRunner, 19990);
    assert.ok(ctrlPort > 0, 'Control server should bind');

    // Test /api/status
    const statusData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${ctrlPort}/api/status`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    assert.strictEqual(statusData.status, 'idle');
    assert.ok(statusData.systemStats, 'Should contain systemStats');

    // Test /api/requests
    const requestsData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${ctrlPort}/api/requests`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    assert.ok(Array.isArray(requestsData), 'Requests should be array');
    assert.strictEqual(requestsData[0].path, '/api/test');
    assert.strictEqual(requestsData[0].method, 'GET');

    // Test /api/browse?dir=drives (Multi-drive Windows support)
    const drivesData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${ctrlPort}/api/browse?dir=drives`, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    assert.strictEqual(drivesData.isDrivesRoot, true);
    assert.ok(drivesData.folders.length > 0, 'Should find at least one drive');

    // Test /api/replay
    mockRunner.activePort = 19999;
    const mockTarget = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ replayed: true, path: req.url }));
    });
    await new Promise((resolve) => mockTarget.listen(19999, '127.0.0.1', resolve));

    const replayData = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ method: 'GET', path: '/replayed-path' });
      const r = http.request({
        hostname: '127.0.0.1',
        port: ctrlPort,
        path: '/api/replay',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });
    assert.strictEqual(replayData.success, true);
    assert.strictEqual(replayData.status, 200);

    // Test /api/locate-folder (Drag-and-Drop)
    const { locateProjectFolder } = await import('../src/server.js');
    const foundAnyRun = locateProjectFolder('any-run');
    assert.ok(foundAnyRun && foundAnyRun.toLowerCase().includes('any-run'), 'Should locate any-run folder');

    const locateData = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({ name: 'any-run' });
      const r = http.request({
        hostname: '127.0.0.1',
        port: ctrlPort,
        path: '/api/locate-folder',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve(JSON.parse(body)));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });
    assert.strictEqual(locateData.success, true);
    assert.ok(locateData.path.toLowerCase().includes('any-run'));

    mockTarget.close();
    ctrlServer.close();
    console.log('  [PASS] Web Control Server, drives browse, /api/replay, and /api/locate-folder verified.');

    // 6. Interception Proxy Test
    console.log('\nTesting zero-dependency Interception Reverse Proxy...');
    const { startInterceptionProxy } = await import('../src/proxy.js');
    let capturedReq = null;

    const mockUpstream = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Custom-Header': 'AnyRunTest' });
      res.end(JSON.stringify({ ok: true, url: req.url }));
    });

    await new Promise((resolve) => mockUpstream.listen(19995, '127.0.0.1', resolve));

    const { server: proxySrv, port: proxyPrt } = await startInterceptionProxy({
      targetPort: 19995,
      targetHost: '127.0.0.1',
      preferredPort: 19996,
      onTraffic: (t) => { capturedReq = t; }
    });

    assert.strictEqual(proxyPrt, 19996, 'Proxy should bind to preferred port');

    // Send HTTP request to proxy
    const proxyResData = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${proxyPrt}/api/v1/users?limit=10`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers['x-custom-header'], 'AnyRunTest');
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    assert.strictEqual(proxyResData.ok, true);
    assert.strictEqual(proxyResData.url, '/api/v1/users?limit=10');
    assert.ok(capturedReq !== null, 'onTraffic should capture request');
    assert.strictEqual(capturedReq.method, 'GET');
    assert.strictEqual(capturedReq.path, '/api/v1/users?limit=10');
    assert.strictEqual(capturedReq.status, 200);
    assert.ok(capturedReq.durationMs >= 0);

    proxySrv.close();
    mockUpstream.close();
    console.log('  [PASS] Interception Reverse Proxy & deep traffic inspection verified.');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n>>> All AnyRun self-checks PASSED successfully!\n');
}

runTests().catch(err => {
  console.error('\n[FAIL] Self-check failed:', err);
  process.exit(1);
});
