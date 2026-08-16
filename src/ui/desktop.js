// Desktop integration. When Storystick runs inside the Electron shell it gains
// native open/save dialogs and an application menu; in a browser every function
// here is inert and the web fallbacks stay in charge.

export function desktopBridge() {
  return typeof window !== 'undefined' ? window.storystickDesktop || null : null;
}

export function isDesktop() {
  return !!desktopBridge();
}

/**
 * Wire the application menu and OS file-open events to app actions.
 * The action names match the menu template in desktop/main.cjs.
 */
export function initDesktop(app, actions) {
  const bridge = desktopBridge();
  if (!bridge) return;

  document.body.dataset.shell = 'desktop';

  bridge.onMenu((action) => {
    const run = actions[action];
    if (run) run();
    else app.setStatus(`Unhandled menu action: ${action}`, true);
  });

  bridge.onOpenFile((payload) => {
    if (payload && payload.text) app.importProjectText(payload.text);
  });
}

/** Native save when running on the desktop, browser download otherwise. */
export async function saveTextFile(name, text, mime, fallback) {
  const bridge = desktopBridge();
  if (bridge) {
    const extension = name.split('.').pop();
    const result = await bridge.saveFile(name, text, [
      { name: extension.toUpperCase(), extensions: [extension] },
      { name: 'All files', extensions: ['*'] },
    ]);
    return result ? result.path : null;
  }
  fallback(name, text, mime);
  return null;
}

/** Native open when running on the desktop; returns null in a browser. */
export async function openTextFile() {
  const bridge = desktopBridge();
  if (!bridge) return null;
  return bridge.openProject();
}
