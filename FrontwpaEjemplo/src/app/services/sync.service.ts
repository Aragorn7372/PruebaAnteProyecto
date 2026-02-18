import { Injectable, inject, signal } from '@angular/core';
import { fromEvent, merge } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';

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
  private db: IDBDatabase | null = null;
  private dbReady: Promise<IDBDatabase>;
  private funkoServiceRef: any = null; // Se inyectará después para evitar dependencia circular

  isOnline = signal(navigator.onLine);
  isSyncing = signal(false);
  pendingCount = signal(0);

  constructor() {
    this.dbReady = this.initDB();
    this.setupOnlineListener();

    // Actualizar contador y sincronizar si hay pendientes
    this.dbReady.then(async () => {
      await this.updatePendingCount();
      const count = this.pendingCount();
      console.log(`Operaciones pendientes al inicio: ${count}`);

      // Si hay operaciones pendientes y hay conexión, sincronizar
      if (count > 0 && navigator.onLine) {
        console.log('Iniciando sincronización automática al detectar operaciones pendientes...');
        setTimeout(() => this.syncPendingOperations(), 2000);
      }
    });
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
        console.log(
          'Cambio de estado de conexión detectado:',
          isNowOnline ? 'ONLINE' : 'OFFLINE',
        );
        this.isOnline.set(isNowOnline);

        if (isNowOnline) {
          console.log('Conexión restaurada, iniciando sincronización...');
          setTimeout(() => this.syncPendingOperations(), 1000);
        } else {
          console.log('Sin conexión a Internet');
        }
      });
  }

  /**
   * Registra el FunkoService para evitar dependencia circular
   */
  setFunkoService(funkoService: any): void {
    this.funkoServiceRef = funkoService;
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

      request.onsuccess = () => resolve(request.result as PendingOperation[]);
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
  async syncPendingOperations(): Promise<void> {
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
