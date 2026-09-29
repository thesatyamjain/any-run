import net from 'node:net';
import os from 'node:os';
import { exec } from 'node:child_process';
import util from 'node:util';

const execAsync = util.promisify(exec);

// Prioritized patterns: Local/Network bound URLs are top priority!
const HIGH_PRIORITY_PATTERNS = [
  /Local:\s+https?:\/\/[^\s:]+:(\d{2,5})/i,
  /Network:\s+https?:\/\/[^\s:]+:(\d{2,5})/i,
  /ready\s+in\s+.*?\s+Local:\s+https?:\/\/[^\s:]+:(\d{2,5})/i,
  /running\s+(?:at|on)\s+https?:\/\/[^\s:]+:(\d{2,5})/i,
  /server\s+(?:is\s+)?running\s+(?:at|on)\s+(?:port\s+)?(?:https?:\/\/[^\s:]+:)?(\d{2,5})/i,
  /listening\s+(?:at|on)\s+(?:port\s+)?(?:https?:\/\/[^\s:]+:)?(\d{2,5})/i
];

const GENERAL_PATTERNS = [
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})/i,
  /port\s*[:=]\s*(\d{2,5})/i,
  /started\s+server\s+on\s+.*?(\d{2,5})/i,
  /localhost:(\d{2,5})/i
];

/**
 * Returns the primary local IPv4 address (Wi-Fi or LAN).
 * @returns {string}
 */
export function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const netInfo of nets[name]) {
      if (netInfo.family === 'IPv4' && !netInfo.internal) {
        return netInfo.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Parses log chunks to find listening port indicators.
 * Avoids picking up "Port XXX is in use" collisions.
 * @param {string} text
 * @returns {number | null}
 */
export function extractPortFromLogs(text) {
  // Strip ANSI escape codes first
  const clean = text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

  // 1. Check for explicit "Local: http://...:PORT" lines first
  for (const pattern of HIGH_PRIORITY_PATTERNS) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port <= 65535) {
        return port;
      }
    }
  }

  // 2. If the text says "Port XXX is in use", ignore XXX and look for what comes after
  if (/is in use, trying another one/i.test(clean)) {
    const afterMatch = clean.replace(/Port\s+\d+\s+is in use.*?(\r?\n|$)/i, '');
    for (const pattern of HIGH_PRIORITY_PATTERNS.concat(GENERAL_PATTERNS)) {
      const match = afterMatch.match(pattern);
      if (match && match[1]) {
        const port = parseInt(match[1], 10);
        if (port > 0 && port <= 65535) {
          return port;
        }
      }
    }
  }

  // 3. General fallback patterns
  for (const pattern of GENERAL_PATTERNS) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port <= 65535) {
        return port;
      }
    }
  }

  return null;
}

/**
 * Checks a single host socket.
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
function probeSocket(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Checks if a given TCP port is actively listening across IPv4, IPv6, and localhost.
 * @param {number} port
 * @param {string | null} preferredHost
 * @returns {Promise<{ open: boolean, host: string }>}
 */
export async function isPortOpen(port, preferredHost = null) {
  if (!port) return { open: false, host: 'localhost' };

  if (preferredHost) {
    const ok = await probeSocket(port, preferredHost);
    return { open: ok, host: preferredHost };
  }

  const targets = ['localhost', '127.0.0.1', '::1'];
  for (const host of targets) {
    const ok = await probeSocket(port, host);
    if (ok) {
      return { open: true, host };
    }
  }

  return { open: false, host: 'localhost' };
}

/**
 * Looks up listening TCP ports for a process ID (or its child process tree).
 * @param {number} pid
 * @returns {Promise<number | null>}
 */
export async function getProcessListeningPort(pid) {
  if (!pid) return null;
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano -p tcp`, { timeout: 2000 });
      const lines = stdout.split('\n');

      let pids = [String(pid)];
      try {
        const { stdout: wmicOut } = await execAsync(`wmic process where (ParentProcessId=${pid}) get ProcessId`, { timeout: 1500 });
        const childPids = wmicOut.split(/\s+/).filter(p => /^\d+$/.test(p));
        pids = pids.concat(childPids);
      } catch {}

      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const lineTrim = line.trim();
          const matchesPid = pids.some(p => lineTrim.endsWith(p));
          if (matchesPid) {
            const parts = lineTrim.split(/\s+/);
            if (parts[1]) {
              const colonIdx = parts[1].lastIndexOf(':');
              if (colonIdx !== -1) {
                const port = parseInt(parts[1].substring(colonIdx + 1), 10);
                if (port > 0 && port < 65536 && port !== 3737) {
                  return port;
                }
              }
            }
          }
        }
      }
    } else {
      // macOS / Linux via lsof
      try {
        const { stdout } = await execAsync(`lsof -iTCP -sTCP:LISTEN -n -P -p ${pid}`, { timeout: 2000 });
        const match = stdout.match(/:(\d+)\s+\(LISTEN\)/);
        if (match && match[1]) {
          const port = parseInt(match[1], 10);
          if (port > 0 && port < 65536 && port !== 3737) return port;
        }
      } catch {}
    }
  } catch {}
  return null;
}

/**
 * Kills any stale process occupying a specific TCP port so the new process
 * gets its intended port cleanly.
 * @param {number} port
 */
export async function freePortIfOccupied(port) {
  if (!port || port === 3737) return;
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano -p tcp`, { timeout: 2000 });
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING') && line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && pid !== String(process.pid)) {
            try {
              await execAsync(`taskkill /pid ${pid} /f /t`, { timeout: 2000 });
            } catch {}
          }
        }
      }
    } else {
      // macOS / Linux
      try {
        await execAsync(`lsof -ti:${port} | xargs kill -9`, { timeout: 2000 });
      } catch {}
    }
  } catch {}
}

/**
 * Dynamically and reactively resolves the active listening port of a launched process.
 * Priority order:
 * 1. Port reported in logs by the child process (highest authority).
 * 2. Port bound to the child process PID tree in netstat.
 * 3. Candidate port AFTER waiting a grace period for the child to announce itself.
 *
 * @param {{
 *   pid: number,
 *   candidatePort: number,
 *   getDetectedPort: () => number | null,
 *   timeoutMs?: number
 * }} options
 * @returns {Promise<{ port: number, host: string }>}
 */
export async function resolveListeningPort({
  pid,
  candidatePort,
  getDetectedPort,
  timeoutMs = 25000
}) {
  const startTime = Date.now();
  const MIN_LOG_WAIT_MS = 2500; // Allow child process at least 2.5s to boot and output port

  while (Date.now() - startTime < timeoutMs) {
    const elapsed = Date.now() - startTime;

    // 1. Log port reported by child process: ALWAYS top priority!
    const logPort = getDetectedPort();
    if (logPort) {
      const probe = await isPortOpen(logPort);
      if (probe.open) {
        return { port: logPort, host: probe.host };
      }
    }

    // 2. Netstat port specifically owned by this child process or sub-processes
    if (pid) {
      const netstatPort = await getProcessListeningPort(pid);
      if (netstatPort) {
        const probe = await isPortOpen(netstatPort);
        if (probe.open) {
          return { port: netstatPort, host: probe.host };
        }
      }
    }

    // 3. Candidate fallback: ONLY check after MIN_LOG_WAIT_MS to prevent grabbing stale ports!
    if (elapsed > MIN_LOG_WAIT_MS && candidatePort) {
      const probe = await isPortOpen(candidatePort);
      if (probe.open) {
        return { port: candidatePort, host: probe.host };
      }
    }

    await new Promise(r => setTimeout(r, 250));
  }

  // Final fallback
  const finalPort = getDetectedPort() || candidatePort || 3000;
  return { port: finalPort, host: 'localhost' };
}

export async function waitForPort(port, timeoutMs = 25000) {
  const res = await isPortOpen(port);
  if (res.open) return true;

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const probe = await isPortOpen(port);
    if (probe.open) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}
