/**
 * Service Worker para sincronización en background de operaciones offline
 * Este worker maneja: caching, Background Sync API, y notificaciones
 */

const CACHE_NAME = 'funkoapp-offline-v1';
const SYNC_TAG = 'sync-pending-operations';
const DB_NAME = 'FunkoAppDB';
const PENDING_OPS_STORE = 'pendingOperations';

console.log('[Sync Worker] Service Worker iniciado correctamente');

// Install: cachear archivos críticos
self.addEventListener('install', (event) => {
  console.log('[Sync Worker] Installing Service Worker');
  self.skipWaiting();
});

// Activate: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[Sync Worker] Activating Service Worker');
  event.waitUntil(self.clients.claim());

  // Limpiar caches antiguos
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
    }),
  );
});

// Background Sync: sincronizar operaciones pendientes cuando vuelve conexión
self.addEventListener('sync', (event) => {
  console.log('[Sync Worker] Sync event triggered:', event.tag);

  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingOperations());
  }
});

// Mensajes desde la app
self.addEventListener('message', (event) => {
  console.log('[Sync Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SYNC_NOW') {
    event.waitUntil(syncPendingOperations());
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLIENTS_CLAIM') {
    self.skipWaiting().then(() => self.clients.claim());
  }
});

// Online: solicitar sync cuando vuelve conexión
self.addEventListener('online', () => {
  console.log('[Sync Worker] Online event detected');
  if (self.registration && self.registration.sync) {
    self.registration.sync
      .register(SYNC_TAG)
      .catch((err) => console.error('[Sync Worker] Error registrando sync:', err));
  }
});

/**
 * Sincroniza operaciones pendientes
 */
async function syncPendingOperations() {
  try {
    console.log('[Sync Worker] Iniciando sincronización de operaciones...');

    const operations = await getPendingOperationsFromDB();
    console.log(`[Sync Worker] Operaciones pendientes encontradas: ${operations.length}`);

    if (operations.length === 0) {
      await notifyClients({
        type: 'SYNC_COMPLETE',
        success: true,
        count: 0,
      });
      return;
    }

    // Notificar a la app que hay operaciones para sincronizar
    await notifyClients({
      type: 'BACKGROUND_SYNC_DETECTED',
      count: operations.length,
    });

    // La app manejará la sincronización real desde el servicio SyncService
    console.log('[Sync Worker] Notificación de sync enviada a la app');
  } catch (error) {
    console.error('[Sync Worker] Error durante la sincronización:', error);
    await notifyClients({
      type: 'SYNC_ERROR',
      error: String(error),
    });
  }
}

/**
 * Obtiene operaciones pendientes de IndexedDB
 */
async function getPendingOperationsFromDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 2);

      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(PENDING_OPS_STORE, 'readonly');
          const store = tx.objectStore(PENDING_OPS_STORE);
          const getAllReq = store.getAll();

          getAllReq.onsuccess = () => {
            resolve(getAllReq.result || []);
            db.close();
          };

          getAllReq.onerror = () => {
            console.error('[Sync Worker] Error obteniendo operaciones:', getAllReq.error);
            resolve([]);
          };
        } catch (e) {
          console.error('[Sync Worker] Error en transaction:', e);
          resolve([]);
        }
      };

      req.onerror = () => {
        console.error('[Sync Worker] Error abriendo DB:', req.error);
        resolve([]);
      };
    } catch (error) {
      console.error('[Sync Worker] Error accediendo IndexedDB:', error);
      resolve([]);
    }
  });
}

/**
 * Notifica a todos los clientes abiertos
 */
async function notifyClients(data) {
  try {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => {
      console.log('[Sync Worker] Notificando cliente:', client.id);
      client.postMessage(data);
    });
  } catch (error) {
    console.error('[Sync Worker] Error notificando clientes:', error);
  }
}

console.log('[Sync Worker] Event listeners configurados correctamente');
