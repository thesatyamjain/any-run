import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, shell, Notification, clipboard } from 'electron';
import { ProjectRunner } from '../runner.js';
import { startControlServer } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let runner = null;
let controlServer = null;
let actualWebPort = 3737;
let webUrl = `http://127.0.0.1:${actualWebPort}`;
let isQuitting = false;

// Resolve application icons across OS platforms
function getAppIcon() {
  const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, 'assets', iconExt);
  try {
    return nativeImage.createFromPath(iconPath);
  } catch (_) {
    return null;
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const state = runner ? runner.getState() : { status: 'idle' };
  const isRunning = state.status === 'running' || state.status === 'proxy_active';
  const statusLabel = isRunning
    ? `Status: RUNNING (${state.framework || 'Custom'}${state.activePort ? ` :${state.activePort}` : ''})`
    : `Status: ${state.status.toUpperCase()}`;

  const contextMenu = Menu.buildFromTemplate([
    { label: 'AnyRun Universal Runner', enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Open Dashboard in Browser',
      click: () => shell.openExternal(webUrl)
    },
    {
      label: 'Copy Public Tunnel URL',
      enabled: Boolean(state.tunnelUrl),
      click: () => {
        if (state.tunnelUrl) {
          clipboard.writeText(state.tunnelUrl);
        }
      }
    },
    {
      label: 'Copy Local Wi-Fi URL',
      enabled: Boolean(state.lanUrl),
      click: () => {
        if (state.lanUrl) {
          clipboard.writeText(state.lanUrl);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Restart Current Project',
      enabled: isRunning,
      click: async () => {
        try {
          if (runner) await runner.restart();
        } catch (e) {
          console.error('[AnyRun Desktop] Restart error:', e.message);
        }
      }
    },
    {
      label: 'Stop Project',
      enabled: isRunning,
      click: async () => {
        try {
          if (runner) await runner.stop();
        } catch (e) {
          console.error('[AnyRun Desktop] Stop error:', e.message);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Quit AnyRun',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`AnyRun — ${statusLabel}`);
  tray.setContextMenu(contextMenu);
}

function setupTray() {
  const icon = getAppIcon();
  if (!icon) return;

  try {
    tray = new Tray(icon.resize({ width: 18, height: 18 }));
    tray.setToolTip('AnyRun Universal Runner & Tunnel Gateway');
    updateTrayMenu();

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });
  } catch (err) {
    console.warn('[AnyRun Desktop] Tray initialization warning:', err.message);
  }
}

function setupApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Select Project Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const res = await dialog.showOpenDialog(mainWindow, {
              title: 'Select Project Directory',
              properties: ['openDirectory']
            });
            if (!res.canceled && res.filePaths.length > 0) {
              mainWindow.webContents.send('project:selected', res.filePaths[0]);
            }
          }
        },
        {
          label: 'Open Dashboard in Browser',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => shell.openExternal(webUrl)
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'AnyRun Documentation',
          click: () => shell.openExternal('https://github.com/any-run/any-run#readme')
        },
        {
          label: 'About AnyRun',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'AnyRun Desktop',
              message: 'AnyRun Universal Runner & Tunnel Gateway',
              detail: `Version: ${app.getVersion() || '1.0.0'}\nMulti-OS Standalone Edition\nNode.js: ${process.versions.node}\nElectron: ${process.versions.electron}`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupIpcHandlers() {
  // Folder picker dialog
  ipcMain.handle('dialog:selectDirectory', async (event, defaultPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Project Directory to Run',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'dontAddToRecent']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // External browser opener
  ipcMain.handle('shell:openExternal', async (event, url) => {
    try {
      if (typeof url === 'string') {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          await shell.openExternal(url);
        }
      }
    } catch (_) {}
  });

  // Native desktop notification
  ipcMain.handle('app:notify', (event, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({
        title: title || 'AnyRun',
        body: body || '',
        icon: getAppIcon()
      }).show();
    }
  });

  // System info
  ipcMain.handle('app:getSystemInfo', () => ({
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion() || '1.0.0',
    webUrl
  }));

  // Window actions
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
}

async function createMainWindow() {
  const icon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#0c0e11', // Prevent white flash on launch
    icon,
    show: false, // Show gracefully when ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });

  // Handle external navigation safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch (_) {}
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(webUrl)) {
      event.preventDefault();
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(url);
        }
      } catch (_) {}
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Load the web control center interface
  await mainWindow.loadURL(webUrl);
}

// Second instance focus
app.on('second-instance', (event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();

    // Check if target folder was passed via CLI or drag-and-drop in 2nd instance
    const secondArgs = app.isPackaged ? commandLine.slice(1) : commandLine.slice(2);
    const candidatePath = secondArgs.find(arg => arg && !arg.startsWith('--') && !arg.endsWith('.js'));
    if (candidatePath) {
      mainWindow.webContents.send('project:selected', path.resolve(candidatePath));
    }
  }
});

app.whenReady().then(async () => {
  // 1. Initialize ProjectRunner and Control Server
  runner = new ProjectRunner();

  // Subscribe runner state changes to update system tray and send desktop notifications
  runner.subscribe((event) => {
    updateTrayMenu();

    if (event.eventType === 'status') {
      const p = event.payload;
      if (p.status === 'running' && p.tunnelUrl && Notification.isSupported()) {
        new Notification({
          title: 'AnyRun — Tunnel Online',
          body: `Public Gateway: ${p.tunnelUrl}`,
          icon: getAppIcon()
        }).show();
      } else if (p.status === 'error' && p.error && Notification.isSupported()) {
        new Notification({
          title: 'AnyRun — Process Alert',
          body: p.error,
          icon: getAppIcon()
        }).show();
      }
    }
  });

  // 2. Start internal Control Server (without auto-exit so desktop stays open)
  const serverResult = await startControlServer(runner, 3737, { autoExit: false });
  actualWebPort = serverResult.port;
  controlServer = serverResult;
  webUrl = `http://127.0.0.1:${actualWebPort}`;

  // 3. Setup IPC, Menus, System Tray, and Main Window
  setupIpcHandlers();
  setupApplicationMenu();
  setupTray();
  await createMainWindow();

  // If a project path was provided as a CLI or drag-and-drop argument, pass it to UI
  const launchArgs = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  const cliProjectPath = launchArgs.find(arg => arg && !arg.startsWith('--') && !arg.endsWith('.js'));
  if (cliProjectPath) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('project:selected', path.resolve(cliProjectPath));
    });
  }
});

// macOS dock activation
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Clean termination on quit
let isCleanedUp = false;

app.on('before-quit', async (event) => {
  if (isCleanedUp) return;
  event.preventDefault();
  isQuitting = true;

  try {
    if (runner) await runner.stop();
  } catch (_) {}

  try {
    if (controlServer && controlServer.server) controlServer.server.close();
  } catch (_) {}

  isCleanedUp = true;
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (err) => {
  console.error('[AnyRun Desktop] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[AnyRun Desktop] Unhandled Rejection:', reason);
});

