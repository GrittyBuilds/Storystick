// Electron main process for the Storystick desktop app.
//
// The web app is loaded straight off disk with no build step — the same files
// the browser version serves. Electron adds only what the web cannot do: native
// open/save dialogs, a real application menu, and .storystick file association.
//
// Security posture: context isolation on, node integration off, sandbox on, a
// strict CSP, and every navigation to a non-local origin handed to the OS
// browser instead of being loaded in-window.

const { app, BrowserWindow, dialog, Menu, shell, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');

let mainWindow = null;
let queuedFile = null;

function fileArgFrom(argv) {
  return (
    argv
      .slice(1)
      .find((arg) => arg.endsWith('.storystick') || arg.endsWith('.storystick.json')) || null
  );
}

async function readProjectFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return { name: path.basename(filePath), path: filePath, text };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const send = (action) => () => sendToRenderer('storystick:menu', action);

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'Save a Copy…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { type: 'separator' },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: send('export') },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: send('print') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: send('redo') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: send('select-all') },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: send('duplicate') },
        { label: 'Delete', accelerator: 'Delete', click: send('delete') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: '2D Plan', accelerator: 'CmdOrCtrl+1', click: send('view-2d') },
        { label: '3D Model', accelerator: 'CmdOrCtrl+2', click: send('view-3d') },
        { type: 'separator' },
        { label: 'Blueprint Mode', click: send('mode-blueprint') },
        { label: 'Paper Mode', click: send('mode-paper') },
        { type: 'separator' },
        { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+0', click: send('fit') },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Project',
      submenu: [
        { label: 'Cut List', click: send('cutlist') },
        { label: 'Schedules', click: send('schedules') },
        { label: 'Estimate', click: send('estimate') },
        { label: 'Code Check', click: send('codecheck') },
        { label: 'Structural Check', click: send('structural') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('settings') },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard & Touch Help', accelerator: 'F1', click: send('help') },
        {
          label: 'Storystick on GitHub',
          click: () => shell.openExternal('https://github.com/GrittyBuilds/Storystick'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#0B1A2B',
    title: 'Storystick',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(INDEX);

  mainWindow.webContents.on('did-finish-load', () => {
    if (queuedFile) {
      sendToRenderer('storystick:open-path', queuedFile);
      queuedFile = null;
    }
  });

  // Anything that is not the local app opens in the user's real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function applyCsp() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; " +
            "object-src 'none'; base-uri 'none'; form-action 'none'",
        ],
      },
    });
  });
}

// --- IPC -------------------------------------------------------------------

ipcMain.handle('storystick:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open a Storystick project',
    filters: [
      { name: 'Storystick project', extensions: ['storystick', 'json'] },
      { name: 'All files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return readProjectFile(result.filePaths[0]);
});

ipcMain.handle('storystick:save', async (_event, payload) => {
  const { suggestedName, text, filters } = payload || {};
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save',
    defaultPath: suggestedName || 'project.storystick',
    filters: filters || [
      { name: 'Storystick project', extensions: ['storystick'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, text, 'utf8');
  return { path: result.filePath, name: path.basename(result.filePath) };
});

ipcMain.handle('storystick:print', async () => {
  if (mainWindow) mainWindow.webContents.print({ silent: false, printBackground: true });
  return true;
});

// --- lifecycle -------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = fileArgFrom(argv);
    if (file) {
      readProjectFile(file)
        .then((payload) => sendToRenderer('storystick:open-path', payload))
        .catch(() => {});
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS delivers file opens through this event, often before the window exists.
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    readProjectFile(filePath)
      .then((payload) => {
        if (mainWindow) sendToRenderer('storystick:open-path', payload);
        else queuedFile = payload;
      })
      .catch(() => {});
  });

  app.whenReady().then(async () => {
    applyCsp();
    buildMenu();
    const file = fileArgFrom(process.argv);
    if (file) queuedFile = await readProjectFile(file).catch(() => null);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
