import { spawn } from 'node:child_process';
import path from 'node:path';
import { detectProject } from './detector.js';
import { extractPortFromLogs, resolveListeningPort, isPortOpen, freePortIfOccupied, getLocalIp } from './port_sniffer.js';
import { createTunnel } from './tunnel.js';
import { generateTerminalQR, generateDataUrlQR, generateSvgQR } from './qr.js';
import { startStaticServer } from './static_server.js';
import { startInterceptionProxy } from './proxy.js';

export class ProjectRunner {
  constructor() {
    this.status = 'idle';
    this.projectDir = null;
    this.projectConfig = null;
    this.activePort = null;
    this.activeHost = 'localhost';
    this.tunnelUrl = null;
    this.lanUrl = null;
    this.tunnelProvider = 'auto';
    this.qrDataUrl = null;
    this.qrSvg = null;
    this.qrLanDataUrl = null;
    this.qrLanSvg = null;
    this.qrTerminal = null;
    this.errorMessage = null;

    this.appProcess = null;
    this.tunnelObj = null;
    this.staticServer = null;
    this.proxyServer = null;
    this.gatewayPort = null;

    this.logs = [];
    this.maxLogs = 2000;
    this.requests = [];
    this.maxRequests = 500;
    this.subscribers = new Set();
    this.startTime = null;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  broadcast(eventType, payload) {
    const event = { eventType, payload, timestamp: new Date().toISOString() };
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (err) {}
    }
  }

  addLog(type, text) {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      type,
      text
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    this.broadcast('log', entry);
  }

  recordRequest({ method, path: reqPath, status, durationMs, clientIp, headers, responseHeaders }) {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      method: (method || 'GET').toUpperCase(),
      path: reqPath || '/',
      status: status || 200,
      durationMs: durationMs || 0,
      clientIp: clientIp || '127.0.0.1',
      headers: headers || {},
      responseHeaders: responseHeaders || {}
    };
    this.requests.unshift(entry);
    if (this.requests.length > this.maxRequests) {
      this.requests.pop();
    }
    this.broadcast('request', entry);
  }

  getSystemStats() {
    const mem = process.memoryUsage();
    return {
      memoryMB: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMB: Math.round(mem.heapUsed / (1024 * 1024)),
      uptimeSec: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      pid: this.appProcess ? this.appProcess.pid : process.pid
    };
  }

  getState() {
    return {
      status: this.status,
      projectDir: this.projectDir,
      projectConfig: this.projectConfig,
      activePort: this.activePort,
      activeHost: this.activeHost,
      gatewayPort: this.gatewayPort || this.activePort,
      tunnelUrl: this.tunnelUrl,
      lanUrl: this.lanUrl,
      tunnelProvider: this.tunnelProvider,
      qrDataUrl: this.qrDataUrl,
      qrSvg: this.qrSvg,
      qrLanDataUrl: this.qrLanDataUrl,
      qrLanSvg: this.qrLanSvg,
      errorMessage: this.errorMessage,
      packageManager: this.packageManager || (this.projectConfig ? this.projectConfig.packageManager : null),
      systemStats: this.getSystemStats(),
      logCount: this.logs.length,
      requestCount: this.requests.length
    };
  }

  async scan(projectDir, options = {}) {
    return await detectProject(projectDir, options);
  }

  async start({
    projectDir,
    portOverride = null,
    tunnelProvider = 'auto',
    skipInstall = false,
    commandOverride = null,
    packageManager = null
  }) {
    if (this.status === 'running' || this.status === 'starting' || this.status === 'installing') {
      await this.stop();
    }

    this.projectDir = path.resolve(projectDir);
    this.tunnelProvider = tunnelProvider;
    this.packageManager = packageManager;
    this.errorMessage = null;
    this.tunnelUrl = null;
    this.lanUrl = null;
    this.qrDataUrl = null;
    this.qrSvg = null;
    this.qrLanDataUrl = null;
    this.qrLanSvg = null;
    this.qrTerminal = null;
    this.startTime = Date.now();

    this.status = 'detecting';
    this.broadcast('status', this.getState());
    this.addLog('system', `Target project directory: ${this.projectDir}`);

    try {
      this.projectConfig = await detectProject(this.projectDir, { packageManager });
      const pmLabel = this.projectConfig.packageManager ? ` [pm: ${this.projectConfig.packageManager}]` : '';
      this.addLog('system', `Architecture detected: ${this.projectConfig.name} [${this.projectConfig.framework}]${pmLabel}`);

      // 1. Dependency check
      if (this.projectConfig.needsInstall && !skipInstall) {
        this.status = 'installing';
        this.broadcast('status', this.getState());
        this.addLog('system', `Installing dependencies (${this.projectConfig.installCommand})...`);

        await this.runInstallCommand(this.projectConfig.installCommand, this.projectDir);
        this.addLog('system', 'Dependencies successfully installed.');
      }

      // 2. Start Application
      this.status = 'starting';
      this.broadcast('status', this.getState());

      const targetPort = portOverride || this.projectConfig.defaultPort || 3000;

      // Free stale processes holding the target port from previous crashed runs
      await freePortIfOccupied(targetPort);

      if (this.projectConfig.isStatic) {
        const { server, port } = await startStaticServer(this.projectDir, targetPort, (msg) => {
          this.addLog('stdout', msg);
        }, (reqData) => {
          this.recordRequest(reqData);
        });
        this.staticServer = server;
        this.activePort = port;
        this.activeHost = 'localhost';
      } else {
        const cmd = commandOverride ? commandOverride.split(' ')[0] : this.projectConfig.command;
        const args = commandOverride ? commandOverride.split(' ').slice(1) : this.projectConfig.args;
        const env = { ...process.env, ...this.projectConfig.env, PORT: String(targetPort), HOST: '0.0.0.0' };

        this.addLog('system', `Executing: ${cmd} ${args.join(' ')} (target port: ${targetPort})`);

        const isWin = process.platform === 'win32';
        this.appProcess = spawn(cmd, args, {
          cwd: this.projectDir,
          env,
          shell: true,
          detached: !isWin,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        let detectedPortFromLogs = null;

        this.appProcess.stdout.on('data', (chunk) => {
          const text = chunk.toString();
          this.addLog('stdout', text);
          const found = extractPortFromLogs(text);
          if (found) {
            detectedPortFromLogs = found;
            this.activePort = found;
          }

          // Parse HTTP server requests from stdout if present (like Vite, Express, Python)
          const reqMatch = text.match(/(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+([^\s]+)\s+(\d{3})?\s*(\d+ms)?/i);
          if (reqMatch) {
            this.recordRequest({
              method: reqMatch[1],
              path: reqMatch[2],
              status: reqMatch[3] ? parseInt(reqMatch[3], 10) : 200,
              durationMs: reqMatch[4] ? parseInt(reqMatch[4], 10) : 1
            });
          }
        });

        this.appProcess.stderr.on('data', (chunk) => {
          const text = chunk.toString();
          this.addLog('stderr', text);
          const found = extractPortFromLogs(text);
          if (found) {
            detectedPortFromLogs = found;
            this.activePort = found;
          }
        });

        this.appProcess.on('exit', (code) => {
          this.addLog('system', `Process exited with code ${code}`);
          if (this.status === 'running' || this.status === 'starting') {
            this.status = 'idle';
            this.broadcast('status', this.getState());
          }
        });

        this.appProcess.on('error', (err) => {
          this.addLog('stderr', `Process error: ${err.message}`);
          this.errorMessage = err.message;
          this.status = 'error';
          this.broadcast('status', this.getState());
        });

        this.addLog('system', `Resolving active socket listener (initial target: ${targetPort})...`);

        const resolved = await resolveListeningPort({
          pid: this.appProcess.pid,
          candidatePort: targetPort,
          getDetectedPort: () => detectedPortFromLogs,
          timeoutMs: 25000
        });

        this.activePort = resolved.port;
        this.activeHost = resolved.host;
      }

      let tunnelTargetPort = this.activePort;
      let tunnelTargetHost = this.activeHost;

      if (!this.projectConfig.isStatic) {
        this.addLog('system', `Initializing live traffic inspection proxy for port ${this.activePort}...`);
        const { server: proxyServer, port: gatewayPort } = await startInterceptionProxy({
          targetPort: this.activePort,
          targetHost: this.activeHost,
          onTraffic: (reqData) => {
            this.recordRequest(reqData);
            if (process.stdout.isTTY) {
              const statusColor = reqData.status < 300 ? '\x1b[32m' : (reqData.status < 400 ? '\x1b[33m' : '\x1b[31m');
              console.log(`  \x1b[90m[HTTP]\x1b[0m ${statusColor}${reqData.status}\x1b[0m \x1b[1m${reqData.method}\x1b[0m ${reqData.path} \x1b[90m(${reqData.durationMs}ms)\x1b[0m`);
            }
          }
        });
        this.proxyServer = proxyServer;
        this.gatewayPort = gatewayPort;
        tunnelTargetPort = gatewayPort;
        tunnelTargetHost = 'localhost';
      }

      const localIp = getLocalIp();
      const effectivePort = this.gatewayPort || this.activePort;
      this.lanUrl = localIp !== 'localhost' ? `http://${localIp}:${effectivePort}` : `http://localhost:${effectivePort}`;

      this.addLog('system', `Service confirmed active at http://${this.activeHost}:${this.activePort}`);
      this.addLog('system', `Local Wi-Fi Network URL: ${this.lanUrl}`);

      // 3. Initiate Public Tunnel
      this.addLog('system', `Opening public tunnel for port ${tunnelTargetPort} (${tunnelTargetHost})...`);
      this.tunnelObj = await createTunnel(tunnelTargetPort, this.tunnelProvider, (msg) => {
        this.addLog('system', `[Tunnel] ${msg}`);
      }, tunnelTargetHost);

      this.tunnelUrl = this.tunnelObj.url;
      this.addLog('system', `Public Tunnel online: ${this.tunnelUrl}`);

      // 4. Generate QR Codes concurrently (Both Public Tunnel and Local Wi-Fi)
      const [qrTerminal, qrDataUrl, qrSvg, qrLanDataUrl, qrLanSvg] = await Promise.all([
        generateTerminalQR(this.tunnelUrl),
        generateDataUrlQR(this.tunnelUrl),
        generateSvgQR(this.tunnelUrl),
        generateDataUrlQR(this.lanUrl),
        generateSvgQR(this.lanUrl)
      ]);

      this.qrTerminal = qrTerminal;
      this.qrDataUrl = qrDataUrl;
      this.qrSvg = qrSvg;
      this.qrLanDataUrl = qrLanDataUrl;
      this.qrLanSvg = qrLanSvg;

      this.printTerminalBanner();

      this.status = 'running';
      this.broadcast('status', this.getState());
      return this.getState();

    } catch (err) {
      this.status = 'error';
      this.errorMessage = err.message;
      this.addLog('stderr', `Execution failed: ${err.message}`);
      this.broadcast('status', this.getState());
      throw err;
    }
  }

  async stop() {
    this.status = 'stopping';
    this.broadcast('status', this.getState());
    this.addLog('system', 'Stopping all active processes and tunnels...');

    if (this.proxyServer) {
      try {
        this.proxyServer.close();
      } catch (e) {}
      this.proxyServer = null;
      this.gatewayPort = null;
    }

    if (this.tunnelObj && this.tunnelObj.process) {
      try {
        this.tunnelObj.process.kill();
      } catch (e) {}
      this.tunnelObj = null;
    }

    if (this.staticServer) {
      try {
        this.staticServer.close();
      } catch (e) {}
      this.staticServer = null;
    }

    if (this.appProcess) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(this.appProcess.pid), '/f', '/t'], { windowsHide: true });
        } else {
          try {
            process.kill(-this.appProcess.pid, 'SIGKILL');
          } catch (_) {
            this.appProcess.kill('SIGKILL');
          }
        }
      } catch (e) {
        try { this.appProcess.kill('SIGKILL'); } catch (_) {}
      }
      this.appProcess = null;
    }

    if (this.activePort) {
      await freePortIfOccupied(this.activePort);
    }

    this.status = 'idle';
    this.tunnelUrl = null;
    this.lanUrl = null;
    this.qrDataUrl = null;
    this.qrSvg = null;
    this.qrLanDataUrl = null;
    this.qrLanSvg = null;
    this.qrTerminal = null;
    this.activePort = null;
    this.startTime = null;
    this.broadcast('status', this.getState());
    this.addLog('system', 'System halted and idle.');
  }

  async restart() {
    if (!this.projectDir) {
      throw new Error('No active project to restart.');
    }
    const currentDir = this.projectDir;
    const currentPort = this.activePort;
    const currentTunnel = this.tunnelProvider;
    const currentPm = this.packageManager;
    await this.stop();
    return await this.start({
      projectDir: currentDir,
      portOverride: currentPort,
      tunnelProvider: currentTunnel,
      packageManager: currentPm
    });
  }

  runInstallCommand(command, cwd) {
    return new Promise((resolve, reject) => {
      const parts = command.split(' ');
      const proc = spawn(parts[0], parts.slice(1), {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      proc.stdout.on('data', d => this.addLog('stdout', d.toString()));
      proc.stderr.on('data', d => this.addLog('stderr', d.toString()));

      proc.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Dependency install failed with exit code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  printTerminalBanner() {
    console.log(`
  \x1b[1m\x1b[32m✔ ANYRUN GATEWAY ACTIVE\x1b[0m \x1b[90m(Built by The Software Labs)\x1b[0m
  \x1b[90m--------------------------------------------------------\x1b[0m
  \x1b[33m➜  Architecture:\x1b[0m  \x1b[1m${this.projectConfig?.name || 'Generic'}\x1b[0m
  \x1b[32m➜  Local Service:\x1b[0m http://${this.activeHost}:${this.activePort}
  \x1b[36m➜  Local Wi-Fi:\x1b[0m   ${this.lanUrl} \x1b[90m(Fastest on same network)\x1b[0m
  \x1b[35m➜  Public Tunnel:\x1b[0m ${this.tunnelUrl}
  \x1b[90m--------------------------------------------------------\x1b[0m
`);
    if (this.qrTerminal) {
      console.log(this.qrTerminal);
    }
    console.log(`\n  \x1b[1mPublic URL:\x1b[0m \x1b[35m${this.tunnelUrl}\x1b[0m\n  \x1b[1mDirect LAN:\x1b[0m \x1b[36m${this.lanUrl}\x1b[0m\n`);
  }
}
