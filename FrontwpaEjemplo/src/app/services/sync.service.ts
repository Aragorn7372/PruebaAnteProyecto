import { Injectable, inject, signal } from '@angular/core';
import { fromEvent, merge, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

export interface PendingOperation {
  id?: number;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'funko';
  data: any;
  timestamp: number;
  retries: number;
}

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private readonly DB_NAME = 'FunkoAppDB';
  private readonly SYNC_STORE = 'pendingOperations';
  private readonly AUTO_SYNC_KEY = 'sync.autoEnabled';
  private readonly INITIAL_BOOTSTRAP_DONE_KEY = 'sync.initialBootstrapDone';
  private db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;
  private funkoServiceRef: any = null; // Se inyectará después para evitar dependencia circular
  private pendingInitialOnlineBootstrap = false;
  private syncCompleted$ = new Subject<void>();

  isOnline = signal(navigator.onLine);
  isSyncing = signal(false);
  pendingCount = signal(0);
  autoSyncEnabled = signal(this.loadAutoSyncPreference());

  constructor() {
    this.dbReady = this.initDB();
    this.setupOnlineListener();

    // Actualizar contador y sincronizar si hay pendientes
    this.dbReady.then(async () => {
      await this.updatePendingCount();
      const count = this.pendingCount();
      console.log(`Operaciones pendientes al inicio: ${count}`);

      // Si hay operaciones pendientes y hay conexión, sincronizar
      if (count > 0 && navigator.onLine && this.autoSyncEnabled()) {
        console.log('Iniciando sincronización automática al detectar operaciones pendientes...');
        setTimeout(() => this.syncPendingOperations(), 2000);
      }

      this.tryRunInitialOnlineBootstrap();
    });
  }

  private loadAutoSyncPreference(): boolean {
    const storedValue = localStorage.getItem(this.AUTO_SYNC_KEY);
    if (storedValue === null) {
      return true;
    }
    return storedValue === 'true';
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 2); // Incrementar versión

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store de funkos (ya existe)
        if (!db.objectStoreNames.contains('Funkos')) {
          db.createObjectStore('Funkos', { keyPath: 'id', autoIncrement: true });
        }

        // Store de operaciones pendientes
        if (!db.objectStoreNames.contains(this.SYNC_STORE)) {
          const store = db.createObjectStore(this.SYNC_STORE, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = (event: Event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        reject(error);
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }
    return this.dbReady;
  }

  private setupOnlineListener(): void {
    // Escuchar eventos de conexión
    const online$ = fromEvent(window, 'online');
    const offline$ = fromEvent(window, 'offline');

    // Log estado inicial
    console.log('Estado inicial de conexión:', navigator.onLine ? 'ONLINE' : 'OFFLINE');
    this.isOnline.set(navigator.onLine);

    merge(online$, offline$)
      .pipe(debounceTime(500))
      .subscribe(() => {
        const isNowOnline = navigator.onLine;
        console.log('Cambio de estado de conexión detectado:', isNowOnline ? 'ONLINE' : 'OFFLINE');
        this.isOnline.set(isNowOnline);

        if (isNowOnline) {
          if (this.autoSyncEnabled()) {
            console.log('Conexión restaurada, iniciando sincronización...');
            setTimeout(() => this.syncPendingOperations(), 1000);
          }
          this.tryRunInitialOnlineBootstrap();
        } else {
          console.log('Sin conexión a Internet');
        }
      });
  }

  setAutoSyncEnabled(enabled: boolean, syncIfEnabled = true): void {
    this.autoSyncEnabled.set(enabled);
    localStorage.setItem(this.AUTO_SYNC_KEY, String(enabled));

    if (enabled && navigator.onLine && syncIfEnabled) {
      this.syncPendingOperations(true);
      this.tryRunInitialOnlineBootstrap();
    }
  }

  toggleAutoSync(): void {
    this.setAutoSyncEnabled(!this.autoSyncEnabled());
  }

  activateAndSync(): void {
    if (!this.autoSyncEnabled()) {
      // Si está desactivado, solo activar. La sincronización se hará cuando el usuario la solicite de nuevo.
      this.setAutoSyncEnabled(true, false);
      return;
    }

    this.syncPendingOperations(true);
  }

  onLoginSuccess(): void {
    const initialBootstrapDone = localStorage.getItem(this.INITIAL_BOOTSTRAP_DONE_KEY) === 'true';

    if (!initialBootstrapDone) {
      this.pendingInitialOnlineBootstrap = true;
      this.setAutoSyncEnabled(true);
      this.tryRunInitialOnlineBootstrap();
    }
  }

  private async tryRunInitialOnlineBootstrap(): Promise<void> {
    if (!this.pendingInitialOnlineBootstrap || !navigator.onLine || !this.funkoServiceRef) {
      return;
    }

    const downloadInitialData = this.funkoServiceRef.downloadInitialData;
    if (typeof downloadInitialData !== 'function') {
      return;
    }

    try {
      await downloadInitialData.call(this.funkoServiceRef);
      this.pendingInitialOnlineBootstrap = false;
      localStorage.setItem(this.INITIAL_BOOTSTRAP_DONE_KEY, 'true');
      console.log('Primera sincronización online completada correctamente');
    } catch (error) {
      console.warn('No se pudo completar la sincronización inicial online:', error);
    }
  }

  /**
   * Registra el FunkoService para evitar dependencia circular
   */
  setFunkoService(funkoService: any): void {
    this.funkoServiceRef = funkoService;
    this.tryRunInitialOnlineBootstrap();
  }

  /**
   * Observable que emite cuando la sincronización se completa
   */
  onSyncCompleted() {
    return this.syncCompleted$.asObservable();
  }

  /**
   * Registra una operación pendiente para sincronizar más tarde
   */
  async addPendingOperation(
    operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retries'>,
  ): Promise<void> {
    const db = await this.ensureDB();
    const pendingOp: Omit<PendingOperation, 'id'> = {
      ...operation,
      timestamp: Date.now(),
      retries: 0,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.SYNC_STORE, 'readwrite');
      const store = transaction.objectStore(this.SYNC_STORE);
      const request = store.add(pendingOp);

      request.onsuccess = () => {
        console.log(
          `Operación ${operation.type} registrada para sincronizar (ID: ${request.result})`,
        );
        this.updatePendingCount();
        resolve();
      };
      request.onerror = () => {
        console.error('Error registrando operación pendiente:', request.error);
        reject(request.error ?? new Error('Failed to add pending operation'));
      };
    });
  }

  /**
   * Obtiene todas las operaciones pendientes
   */
  async getPendingOperations(): Promise<PendingOperation[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.SYNC_STORE, 'readonly');
      const store = transaction.objectStore(this.SYNC_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const operations = request.result as PendingOperation[];

        // Convertir strings base64 en Files y crear FormData si es necesario
        // Esto es necesario porque FormData y File/Blob no se guardan bien en IndexedDB a veces en ciertos navegadores (ej Chrome) sin procesamiento adicional.
        // Pero en este caso particular, guardaste "file" explícitamente y al recuperalo, si era Base64, lo volvemos a construir o si era un objeto lo enviamos tal cual.
        // También la estructura del backend espera IFormFile? que funciona con FormData.

        resolve(operations);
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to get pending operations'));
    });
  }

  /**
   * Elimina una operación pendiente después de sincronizarla
   */
  private async deletePendingOperation(id: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.SYNC_STORE, 'readwrite');
      const store = transaction.objectStore(this.SYNC_STORE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to delete pending operation'));
    });
  }

  /**
   * Actualiza el contador de operaciones pendientes
   */
  private async updatePendingCount(): Promise<void> {
    try {
      const operations = await this.getPendingOperations();
      this.pendingCount.set(operations.length);
    } catch (err) {
      console.error('Error actualizando contador de pendientes:', err);
    }
  }

  /**
   * Sincroniza todas las operaciones pendientes con el servidor
   */
  async syncPendingOperations(force = false): Promise<void> {
    if (!force && !this.autoSyncEnabled()) {
      console.log('Sincronización omitida: modo automático desactivado');
      return;
    }

    if (!navigator.onLine || this.isSyncing()) {
      console.log(
        'Sincronización omitida:',
        !navigator.onLine ? 'Sin conexión' : 'Ya sincronizando',
      );
      return;
    }

    if (!this.funkoServiceRef) {
      console.warn('FunkoService no está registrado todavía');
      return;
    }

    this.isSyncing.set(true);
    console.log('Iniciando sincronización...');

    try {
      const operations = await this.getPendingOperations();
      console.log(`Operaciones pendientes encontradas: ${operations.length}`);

      if (operations.length === 0) {
        console.log('No hay operaciones pendientes');
        this.isSyncing.set(false);
        return;
      }

      console.log(`Sincronizando ${operations.length} operaciones...`);

      // Ordenar por timestamp
      operations.sort((a, b) => a.timestamp - b.timestamp);

      let successCount = 0;
      let failCount = 0;

      for (const operation of operations) {
        try {
          console.log(`Procesando operación ${operation.type} (ID: ${operation.id})...`);
          // Ejecutar la operación usando el FunkoService
          await this.funkoServiceRef.executePendingOperation(operation);

          // Si tuvo éxito, eliminar de pendientes
          if (operation.id) {
            await this.deletePendingOperation(operation.id);
            successCount++;
            console.log(`Operación ${operation.type} sincronizada correctamente`);
          }
        } catch (err) {
          console.error(`Error sincronizando operación ${operation.id}:`, err);
          failCount++;
        }
      }

      await this.updatePendingCount();
      console.log(`Sincronización completada: ${successCount} exitosas, ${failCount} fallidas`);
      // Emitir evento de sincronización completada
      this.syncCompleted$.next();
    } catch (err) {
      console.error('Error durante la sincronización:', err);
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * Elimina todas las operaciones pendientes (usar con precaución)
   */
  async clearPendingOperations(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.SYNC_STORE, 'readwrite');
      const store = transaction.objectStore(this.SYNC_STORE);
      const request = store.clear();

      request.onsuccess = () => {
        this.updatePendingCount();
        resolve();
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to clear pending operations'));
    });
  }
}
