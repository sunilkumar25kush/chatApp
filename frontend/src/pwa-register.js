/**
 * Service Worker Registration for PWA
 * This registers the Workbox-generated service worker for offline support
 */

// Only register in production and if service workers are supported
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Wait for the page to load before registering
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      console.log('[PWA] Service Worker registered:', registration.scope);

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000); // Every hour

      // Handle updates - automatically activate immediately
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version installed, activating immediately...');
              if (newWorker.postMessage) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            }
          });
        }
      });

      // Listen for controller change (when SW takes over)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

    } catch (error) {
      console.error('[PWA] Service Worker registration failed:', error);
    }
  });

  // Handle offline/online events
  window.addEventListener('online', () => {
    console.log('[PWA] App is online');
    // Trigger queue flush if there's a pending queue
    window.dispatchEvent(new CustomEvent('app-online'));
  });

  window.addEventListener('offline', () => {
    console.log('[PWA] App is offline');
    window.dispatchEvent(new CustomEvent('app-offline'));
  });
}