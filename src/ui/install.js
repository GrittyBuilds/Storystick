// Progressive-install plumbing: register the service worker, surface the
// install prompt where the browser offers one, and tell the user when a new
// version is waiting.

let deferredPrompt = null;

export function initInstall(app) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // A service worker needs a real origin; skip it when opened from file://.
  if (location.protocol === 'file:') return;

  navigator.serviceWorker
    .register(new URL('../../sw.js', import.meta.url), { scope: './' })
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            app.setStatus('A new version of Storystick is ready — reload to pick it up.');
          }
        });
      });
    })
    .catch(() => {
      /* offline support is a bonus, never a hard requirement */
    });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    app.setInstallAvailable(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    app.setInstallAvailable(false);
    app.setStatus('Storystick is installed. It works offline from now on.');
  });
}

export function canInstall() {
  return !!deferredPrompt;
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  event.prompt();
  const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' }));
  return choice.outcome;
}

/** iOS has no install prompt; it needs the Share-sheet instructions instead. */
export function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}
