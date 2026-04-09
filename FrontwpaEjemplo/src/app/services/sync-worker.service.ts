import { Injectable, inject, signal } from '@angular/core';
import { SyncService } from './sync.service';

@Injectable({
  providedIn: 'root',
})
export class SyncWorkerService {
  private syncService = inject(SyncService);
  private workerRegistration: ServiceWorkerRegistration | null = null;
  workerReady = signal(false);

  constructor() {
    this.initializeSyncWorker();
    this.setupOnlineOfflineHandlers();
  }

  /**
   * Inicializa el service worker de sincronización
   */
  private async initializeSyncWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SyncWorkerService] Service Workers no soportados');
      return;
    }

    try {
      // Primero registrar el NGSW que Angular genera
      const ngswReg = await navigator.serviceWorker.getRegistrations();
      console.log('[SyncWorkerService] Registros SW encontrados:', ngswReg.length);

      // Escuchar mensajes de cualquier SW
      this.setupWorkerMessageListener();

      // Solicitar sincronización inicial
      await this.requestBackgroundSync();
      this.workerReady.set(true);
    } catch (error) {
      console.error('[SyncWorkerService] Error inicializando:', error);
    }
  }

  /**
   * Configura listener para mensajes del service worker
   */
  private setupWorkerMessageListener(): void {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (!event.data || !event.data.type) {
        return;
      }

      const { type } = event.data;
      console.log('[SyncWorkerService] Mensaje del SW:', type);

      if (type === 'BACKGROUND_SYNC_DETECTED') {
        console.log(`[SyncWorkerService] Sincronización detectada:`, event.data.count);
        this.syncService.syncPendingOperations(true);
      }

      if (type === 'SYNC_COMPLETE') {
        console.log('[SyncWorkerService] Sincronización completada');
      }

      if (type === 'SYNC_ERROR') {
        console.error('[SyncWorkerService] Error en sync:', event.data.error);
      }
    });
  }

  /**
   * Solicita un background sync al service worker
   */
  async requestBackgroundSync(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length === 0) {
        console.warn('[SyncWorkerService] No hay SWs registrados');
        return;
      }

      const pendingOps = await this.syncService.getPendingOperations();
      if (pendingOps.length === 0) {
        console.log('[SyncWorkerService] Sin operaciones pendientes');
        return;
      }

      console.log(`[SyncWorkerService] Registrando sync para ${pendingOps.length} operaciones`);
      const firstReg = registrations[0];

      const syncReg = firstReg as any;
      if (syncReg.sync) {
        await syncReg.sync.register('sync-pending-operations').catch((err: any) => {
          console.warn('[SyncWorkerService] Background Sync no disponible:', err?.message);
        });
      } else {
        console.warn('[SyncWorkerService] Background Sync API no soportada');
      }
    } catch (error) {
      console.error('[SyncWorkerService] Error registrando sync:', error);
    }
  }

  /**
   * Maneja cambios de estado online/offline
   */
  private setupOnlineOfflineHandlers(): void {
    window.addEventListener('online', () => {
      console.log('[SyncWorkerService] Online event detectado');
      // Esperar un poco para que la red esté realmente lista
      setTimeout(() => {
        this.requestBackgroundSync();
        this.syncService.syncPendingOperations(true);
      }, 1000);
    });

    window.addEventListener('offline', () => {
      console.log('[SyncWorkerService] Offline event detectado');
    });
  }
}
