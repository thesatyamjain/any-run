import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BIN_DIR = path.resolve(__dirname, '..', '.bin');

function getCloudflareBinaryInfo() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    const is64 = arch === 'x64' || arch === 'arm64';
    return {
      filename: 'cloudflared.exe',
      url: is64
        ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
        : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-386.exe'
    };
  }

  if (platform === 'darwin') {
    const isArm = arch === 'arm64';
    return {
      filename: 'cloudflared',
      url: isArm
        ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz'
        : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz'
    };
  }

  // Linux & fallback
  const isArm64 = arch === 'arm64';
  const isArm = arch.startsWith('arm');
  const linuxUrl = isArm64
    ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
    : isArm
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

  return {
    filename: 'cloudflared',
    url: linuxUrl
  };
}

/**
 * Ensures cloudflared binary is available. If not present in PATH or .bin/,
 * downloads the official standalone executable.
 * @param {(msg: string) => void} onProgress
 * @returns {Promise<string>} Path to cloudflared executable
 */
export async function ensureCloudflared(onProgress = () => {}) {
  const binaryInfo = getCloudflareBinaryInfo();
  const binaryPath = path.join(BIN_DIR, binaryInfo.filename);

  // 1. Check local .bin/ and verify it's not a corrupted/empty download
  if (fs.existsSync(binaryPath)) {
    try {
      const stats = fs.statSync(binaryPath);
      if (stats.size > 1000000) {
        return binaryPath;
      }
      // If corrupted or empty, clean up
      fs.unlinkSync(binaryPath);
    } catch (_) {}
  }

  // 2. Check system PATH
  try {
    const { execSync } = await import('node:child_process');
    const checkCmd = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared';
    const out = execSync(checkCmd, { stdio: 'pipe' }).toString().trim();
    if (out) return 'cloudflared';
  } catch {
    // not in PATH
  }

  // 3. Download standalone cloudflared binary
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  onProgress(`Downloading portable Cloudflare tunnel client (${process.platform}-${process.arch})...`);
  await downloadWithRedirect(binaryInfo.url, binaryPath, onProgress);

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(binaryPath, 0o755);
    } catch (_) {}
  }

  onProgress('Cloudflare client ready.');
  return binaryPath;
}

function downloadWithRedirect(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const tempPath = destPath + '.tmp-' + Date.now();

    function get(currentUrl) {
      https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with status code ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(tempPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const percent = Math.round((downloadedBytes / totalBytes) * 100);
            onProgress(`Downloading Cloudflare tunnel: ${percent}%`);
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
              }
              fs.renameSync(tempPath, destPath);
              resolve(destPath);
            } catch (renameErr) {
              reject(renameErr);
            }
          });
        });

        fileStream.on('error', (err) => {
          fs.unlink(tempPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(tempPath, () => {});
        reject(err);
      });
    }

    get(url);
  });
}

/**
 * Starts a Cloudflare Quick Tunnel.
 * Configured with --http-host-header localhost to prevent host header blocking
 * and dual-stack host resolution.
 *
 * @param {number} port
 * @param {(msg: string) => void} onLog
 * @param {string} host
 * @returns {Promise<{ url: string, process: import('node:child_process').ChildProcess, provider: string }>}
 */
export async function startCloudflareTunnel(port, onLog = () => {}, host = 'localhost') {
  const binaryPath = await ensureCloudflared(onLog);
  const targetOrigin = host === '::1' ? `http://[::1]:${port}` : `http://${host}:${port}`;
  onLog(`Initializing Cloudflare Quick Tunnel for ${targetOrigin}...`);

  return new Promise((resolve, reject) => {
    // Pass --http-host-header localhost to rewrite incoming Host header
    // so Vite, Next.js, Django, and other frameworks accept traffic without 502/403.
    const args = [
      'tunnel',
      '--url', targetOrigin,
      '--http-host-header', 'localhost'
    ];

    const child = spawn(binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let resolved = false;
    let accumulatedLogs = '';

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error('Cloudflare tunnel timed out waiting for public URL'));
      }
    }, 30000);

    const handleData = (chunk) => {
      const text = chunk.toString();
      accumulatedLogs += text;
      onLog(text.trim());

      const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
      if (urlMatch && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          url: urlMatch[0],
          process: child,
          provider: 'cloudflare'
        });
      }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Cloudflare tunnel exited prematurely with code ${code}: ${accumulatedLogs.slice(-300)}`));
      }
    });
  });
}

/**
 * Starts a Pinggy tunnel using native OpenSSH.
 * @param {number} port
 * @param {(msg: string) => void} onLog
 * @param {string} host
 * @returns {Promise<{ url: string, process: import('node:child_process').ChildProcess, provider: string }>}
 */
export async function startPinggyTunnel(port, onLog = () => {}, host = 'localhost') {
  onLog(`Initializing Pinggy tunnel for local port ${port} via OpenSSH...`);

  return new Promise((resolve, reject) => {
    const nullHostFile = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const child = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', `UserKnownHostsFile=${nullHostFile}`,
      '-p', '443',
      `-R0:localhost:${port}`,
      'a.pinggy.io'
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let resolved = false;
    let accumulatedLogs = '';

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error('Pinggy tunnel timed out waiting for public URL'));
      }
    }, 25000);

    const handleData = (chunk) => {
      const text = chunk.toString();
      accumulatedLogs += text;
      onLog(text.trim());

      const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.(?:free\.)?(?:a\.)?pinggy\.(?:link|io)/i);
      if (urlMatch && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({
          url: urlMatch[0],
          process: child,
          provider: 'pinggy'
        });
      }
    };

    child.stdout.on('data', handleData);
    child.stderr.on('data', handleData);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Pinggy tunnel exited with code ${code}`));
      }
    });
  });
}

/**
 * Starts a public tunnel with automatic fallback.
 * @param {number} port
 * @param {'auto' | 'cloudflare' | 'pinggy'} preferredProvider
 * @param {(msg: string) => void} onLog
 * @param {string} host
 */
export async function createTunnel(port, preferredProvider = 'auto', onLog = () => {}, host = 'localhost') {
  if (preferredProvider === 'pinggy') {
    try {
      return await startPinggyTunnel(port, onLog, host);
    } catch (err) {
      onLog(`Pinggy tunnel failed (${err.message}). Falling back to Cloudflare...`);
      return await startCloudflareTunnel(port, onLog, host);
    }
  }

  // Default: Cloudflare with fallback to Pinggy
  try {
    return await startCloudflareTunnel(port, onLog, host);
  } catch (err) {
    onLog(`Cloudflare tunnel failed (${err.message}). Falling back to Pinggy via OpenSSH...`);
    try {
      return await startPinggyTunnel(port, onLog, host);
    } catch (sshErr) {
      throw new Error(`All tunnel providers failed. Cloudflare: ${err.message}. Pinggy: ${sshErr.message}`);
    }
  }
}
