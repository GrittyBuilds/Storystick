// The only bridge between the Electron main process and the app. Everything is
// an explicit, narrow call — the renderer never sees Node, ipcRenderer or the
// filesystem.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storystickDesktop', {
  platform: process.platform,
  electron: process.versions.electron,

  /** Native open dialog. Resolves to { name, path, text } or null if cancelled. */
  openProject: () => ipcRenderer.invoke('storystick:open'),

  /** Native save dialog. Resolves to { name, path } or null if cancelled. */
  saveFile: (suggestedName, text, filters) =>
    ipcRenderer.invoke('storystick:save', { suggestedName, text, filters }),

  print: () => ipcRenderer.invoke('storystick:print'),

  /** Application-menu actions. */
  onMenu: (handler) => {
    ipcRenderer.on('storystick:menu', (_event, action) => handler(action));
  },

  /** A .storystick file opened from the OS (double-click, drag to dock, CLI arg). */
  onOpenFile: (handler) => {
    ipcRenderer.on('storystick:open-path', (_event, payload) => handler(payload));
  },
});
