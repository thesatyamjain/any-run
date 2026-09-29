#!/usr/bin/env node

import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import { ProjectRunner } from '../src/runner.js';
import { startControlServer } from '../src/server.js';

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
  \x1b[1m\x1b[33m▲ ANYRUN\x1b[0m \x1b[90m// Universal Project Runner, Tunnel & QR Gateway\x1b[0m

  \x1b[1mUSAGE:\x1b[0m
    any-run [project-path] [options]

  \x1b[1mOPTIONS:\x1b[0m
    --port <number>             Target application port override
    --tunnel <cloudflare|pinggy|auto> Tunnel provider (default: auto)
    --web-port <number>         Web Control Center port (default: 3737)
    --no-open                   Do not automatically open the browser
    --auto-exit                 Auto-exit background process when Web Control Center closes
    --help                      Show this help manual

  \x1b[1mEXAMPLES:\x1b[0m
    any-run                     Launch the Web Control Center
    any-run ./my-react-app      One-click run, tunnel & QR for React project
    any-run C:\\projects\\api    One-click run & tunnel for Python FastAPI
  `);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
}

let projectDir = null;
let portOverride = null;
let tunnelProvider = 'auto';
let webPort = 3737;
let autoOpen = true;

let autoExit = Boolean(process.env.ANYRUN_AUTO_EXIT);

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--port' && args[i + 1]) {
    portOverride = parseInt(args[++i], 10);
  } else if (arg === '--tunnel' && args[i + 1]) {
    tunnelProvider = args[++i];
  } else if (arg === '--web-port' && args[i + 1]) {
    webPort = parseInt(args[++i], 10);
  } else if (arg === '--no-open') {
    autoOpen = false;
  } else if (arg === '--auto-exit') {
    autoExit = true;
  } else if (!arg.startsWith('--') && !projectDir) {
    projectDir = arg;
  }
}

async function openBrowser(url) {
  if (!url) return;
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

function copyToClipboard(text) {
  if (!text) return;
  try {
    if (process.platform === 'win32') {
      const proc = spawn('clip', { windowsHide: true });
      proc.stdin.end(text);
    } else if (process.platform === 'darwin') {
      const proc = spawn('pbcopy');
      proc.stdin.end(text);
    } else {
      const proc = spawn('xclip', ['-selection', 'clipboard']);
      proc.stdin.end(text);
    }
    console.log(`\x1b[32m✔ Copied to clipboard:\x1b[0m ${text}`);
  } catch (err) {
    console.error(`Failed to copy to clipboard: ${err.message}`);
  }
}

function setupInteractiveShortcuts(runner, webUrl) {
  if (!process.stdin.isTTY) return;

  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', async (key) => {
      // Ctrl+C or 'q' -> quit
      if (key === '\u0003' || key.toLowerCase() === 'q') {
        console.log('\n\x1b[90mGracefully terminating AnyRun and tunnels...\x1b[0m');
        await runner.stop();
        process.exit(0);
      }

      const k = key.toLowerCase();
      if (k === 'o') {
        // Open public tunnel
        if (runner.tunnelUrl) {
          console.log(`\x1b[36mOpening Public Tunnel:\x1b[0m ${runner.tunnelUrl}`);
          openBrowser(runner.tunnelUrl);
        } else if (runner.lanUrl) {
          openBrowser(runner.lanUrl);
        }
      } else if (k === 'l') {
        // Open Dashboard
        console.log(`\x1b[36mOpening Control Center:\x1b[0m ${webUrl}`);
        openBrowser(webUrl);
      } else if (k === 'r') {
        // Restart
        console.log('\x1b[33mRestarting project runner...\x1b[0m');
        try {
          await runner.restart();
        } catch (err) {
          console.error(`Restart error: ${err.message}`);
        }
      } else if (k === 'c') {
        // Copy Public Tunnel URL
        if (runner.tunnelUrl) copyToClipboard(runner.tunnelUrl);
      } else if (k === 'w') {
        // Copy Wi-Fi LAN URL
        if (runner.lanUrl) copyToClipboard(runner.lanUrl);
      } else if (k === 'h') {
        // Show shortcuts
        console.log(`
  \x1b[1m\x1b[33mSHORTCUTS:\x1b[0m
    \x1b[36mo\x1b[0m  Open Public Tunnel in browser
    \x1b[36ml\x1b[0m  Open Web Dashboard (${webUrl})
    \x1b[36mr\x1b[0m  Restart current application
    \x1b[36mc\x1b[0m  Copy Public Tunnel URL to clipboard
    \x1b[36mw\x1b[0m  Copy Local Wi-Fi URL to clipboard
    \x1b[36mq\x1b[0m  Quit AnyRun
        `);
      }
    });
  } catch (err) {
    // Non-fatal if raw mode fails
  }
}

async function main() {
  const runner = new ProjectRunner();

  // 1. Start Web Control Center Server
  const { port: actualWebPort } = await startControlServer(runner, webPort, { autoExit });
  const webUrl = `http://localhost:${actualWebPort}`;

  console.log(`
  \x1b[1m\x1b[33m▲ ANYRUN\x1b[0m \x1b[1mv1.0.0\x1b[0m \x1b[90m// Industry Standard Tunnel Dispatcher\x1b[0m
  \x1b[90m--------------------------------------------------------\x1b[0m
  \x1b[32m➜\x1b[0m  \x1b[1mDashboard:\x1b[0m  \x1b[36m${webUrl}\x1b[0m
  \x1b[90m--------------------------------------------------------\x1b[0m`);

  if (autoOpen) {
    setTimeout(() => {
      openBrowser(webUrl);
    }, 600);
  }

  // 2. Setup interactive keyboard shortcuts (o, r, c, w, l, q)
  setupInteractiveShortcuts(runner, webUrl);

  // 3. If a project path was provided, launch immediately
  if (projectDir) {
    const resolvedPath = path.resolve(projectDir);
    console.log(`\n  \x1b[1mLaunching target:\x1b[0m \x1b[90m${resolvedPath}\x1b[0m\n`);
    try {
      await runner.start({
        projectDir: resolvedPath,
        portOverride,
        tunnelProvider
      });
      console.log(`\n  \x1b[90mShortcuts: [o] open  [r] restart  [c] copy tunnel  [w] copy wifi  [q] quit\x1b[0m\n`);
    } catch (err) {
      console.error(`\n  \x1b[31mExecution failed:\x1b[0m ${err.message}\n`);
    }
  } else {
    console.log(`\n  Select or drag a folder in the Web Control Center at \x1b[36m${webUrl}\x1b[0m\n`);
  }

  const cleanup = async () => {
    console.log('\n\x1b[90mGracefully terminating AnyRun and tunnels...\x1b[0m');
    await runner.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
}

process.on('uncaughtException', (err) => {
  console.error('\n\x1b[31m[AnyRun] Uncaught Exception:\x1b[0m', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n\x1b[31m[AnyRun] Unhandled Rejection:\x1b[0m', reason);
});

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
