'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const os   = require('os');

// ── Prevent second instances ──────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// ── Start embedded HTTP server ─────────────────────────────────────────────────
let serverInstance = null;
let serverPort     = 4173;

async function startEmbeddedServer() {
  try {
    const { startServer } = require('./server.js');
    serverInstance = await startServer(serverPort);
    // Grab actual port in case of EADDRINUSE fallback
    serverPort = serverInstance.address().port;
    console.log(`[Wong] Embedded server running on port ${serverPort}`);
  } catch (err) {
    console.error('[Wong] Server start error:', err);
  }
}

// ── Window management ──────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1340,
    height: 820,
    minWidth:  900,
    minHeight: 600,
    title: 'Wong',
    backgroundColor: '#070707',
    icon: path.join(__dirname, 'Images', 'icon.png'),
    show: false,   // shown after ready-to-show
    frame: false,  // custom frameless look
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js'),
      webSecurity: false, // allow loading local images etc.
      partition: 'persist:wong',
    },
  });

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.WONG_DEV) mainWindow.webContents.openDevTools();
  });

  // Developer shortcuts: F5 / Ctrl+R to reload, F12 / Ctrl+Shift+I to toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // Reload page
      if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
        mainWindow.reload();
        event.preventDefault();
      }
      // Toggle DevTools
      if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── IPC handlers (system actions forwarded from preload) ──────────────────────
ipcMain.on('reiniciarSteam', () => {
  // Showcase mode: Steam restart feedback
  console.log('[Wong Showcase] Steam restart triggered (Showcase mode).');
});

ipcMain.handle('dialog:openDirectory', async (_e, opts = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: opts.title || 'Select Folder',
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Window control handlers (frameless titlebar buttons)
ipcMain.on('window:close',    () => { if (mainWindow) mainWindow.close(); });
ipcMain.on('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

// Generic async invoke forwarded from the preload bridge
ipcMain.handle('invoke', async (_e, channel, payload) => {
  if (channel === 'dialog:openDirectory') {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: payload?.title || 'Select Folder',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  }
  return null;
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startEmbeddedServer();
  createWindow();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverInstance) {
    serverInstance.close();
  }
  if (process.platform !== 'darwin') app.quit();
});
