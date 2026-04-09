import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, from, firstValueFrom, Subject } from 'rxjs';
import { tap, catchError, switchMap, timeout } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { IndexDbService } from './indexdb.service';
import { SyncService } from './sync.service';
export interface Funko {
  id?: number;
  nombre: string;
  precio: number;
  categoria: string;
  imagen?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateFunkoDto {
  nombre: string;
  precio: number;
  categoria: string;
  imagen?: string;
}

export interface UpdateFunkoDto {
  nombre?: string;
  precio?: number;
  categoria?: string;
  imagen?: string;
}

@Injectable({
  providedIn: 'root',
})
export class FunkoService {
  private db = inject(IndexDbService);
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private syncService = inject(SyncService);
  private dataChanged$ = new Subject<void>();

  private readonly API_URL = 'https://pruebaanteproyecto.onrender.com/api/funkos';
  private readonly REQUEST_TIMEOUT_MS = 8000;

  constructor() {
    // Registrar este servicio en SyncService para evitar dependencia circular
    this.syncService.setFunkoService(this);

    // Intentar sincronizar al arrancar si hay conexión
    if (navigator.onLine) {
      this.syncService.syncPendingOperations();
    }
  }

  /**
   * Observable que emite cuando hay cambios en los datos de funkos
   */
  onDataChanged() {
    return this.dataChanged$.asObservable();
  }

  async downloadInitialData(): Promise<void> {
    if (!navigator.onLine) {
      return;
    }

    await firstValueFrom(this.getFunkos());
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  getFunkos(): Observable<Funko[]> {
    if (!navigator.onLine) {
      console.log('Modo offline detectado: cargando funkos desde IndexedDB');
      return from(this.db.getAllData<Funko>());
    }

    return this.http.get<Funko[]>(this.API_URL).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      tap({
        next: async (funkos) => {
          // Guardar en IndexDB cada funko
          for (const funko of funkos) {
            try {
              if (funko.id) {
                // Verificar si ya existe en IndexDB
                const existing = await this.db.getById<Funko>(funko.id);
                if (existing) {
                  await this.db.updateData(funko as Funko & { id: number });
                } else {
                  await this.db.addData(funko);
                }
              } else {
                await this.db.addData(funko);
              }
            } catch (err) {
              console.warn('Error guardando en IndexDB:', err);
            }
          }
          console.log('Funkos guardados en IndexDB para uso offline');
        },
        error: (err) => console.error('Error obteniendo funkos del servidor:', err),
      }),
      catchError((error) => {
        console.warn('Sin conexión, cargando desde IndexDB');
        return from(this.db.getAllData<Funko>());
      }),
    );
  }

  getFunko(id: number): Observable<Funko> {
    if (!navigator.onLine) {
      console.log(`Modo offline detectado: cargando funko ${id} desde IndexedDB`);
      return from(this.db.getById<Funko>(id)).pipe(
        switchMap((funko) => (funko ? of(funko) : of({} as Funko))),
      );
    }

    return this.http.get<Funko>(`${this.API_URL}/${id}`).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      tap({
        next: async (funko) => {
          try {
            if (funko.id) {
              await this.db.updateData(funko as Funko & { id: number });
            } else {
              await this.db.addData(funko);
            }
          } catch (err) {
            console.warn('Error guardando funko en IndexDB:', err);
          }
        },
        error: (err) => console.error('Error obteniendo funko:', err),
      }),
      catchError((error) => {
        console.warn('Sin conexión, cargando desde IndexDB');
        return from(this.db.getById<Funko>(id)).pipe(
          switchMap((funko) => (funko ? of(funko) : of({} as Funko))),
        );
      }),
    );
  }

  createFunko(
    nombre: string,
    precio: number,
    categoria: string,
    file: File | null,
  ): Observable<Funko> {
    if (!navigator.onLine) {
      return from(
        (async () => {
          const offlineFunko: Funko = {
            nombre,
            precio,
            categoria,
            imagen: 'pending-upload.png',
          };

          const localId = await this.db.addData(offlineFunko);
          const savedFunko = { ...offlineFunko, id: localId };

          await this.syncService.addPendingOperation({
            type: 'CREATE',
            entity: 'funko',
            data: { nombre, precio, categoria, file, localId },
          });

          console.log('Funko guardado localmente (offline), pendiente de sincronizar');
          return savedFunko;
        })(),
      );
    }

    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('price', precio.toString());
    formData.append('categoria', categoria);
    if (file) {
      formData.append('file', file);
    }

    return this.http
      .post<Funko>(this.API_URL, formData, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        timeout(this.REQUEST_TIMEOUT_MS),
        tap({
          next: async (funko) => {
            try {
              if (funko && funko.id) {
                await this.db.updateData(funko as Funko & { id: number });
              } else {
                await this.db.addData(funko);
              }
              this.dataChanged$.next();
            } catch (err) {
              console.warn('Error guardando funko creado en IndexDB:', err);
            }
          },
          error: (err) => console.error('Error creando funko:', err),
        }),
        catchError((error) => {
          console.warn('Sin conexión, guardando en IndexDB como pendiente');
          return from(
            (async () => {
              const offlineFunko: Funko = {
                nombre,
                precio,
                categoria,
                imagen: 'pending-upload.png',
              };

              // Guardar en IndexDB
              const localId = await this.db.addData(offlineFunko);
              const savedFunko = { ...offlineFunko, id: localId };

              // Para File uploads desde IndexDB
              let fileData = null;
              if (file) {
                // Convertirlo opcionalmente u omitir
                // fileData = file;
              }
              // Registrar operación pendiente
              await this.syncService.addPendingOperation({
                type: 'CREATE',
                entity: 'funko',
                data: { nombre, precio, categoria, file, localId },
              });

              this.dataChanged$.next();
              console.log('Funko guardado localmente, se sincronizará cuando haya conexión');
              return savedFunko;
            })(),
          );
        }),
      );
  }

  updateFunko(
    id: number,
    nombre: string,
    precio: number,
    categoria: string,
    file: File | null,
  ): Observable<Funko> {
    if (!navigator.onLine) {
      return from(
        (async () => {
          const offlineFunko: Funko & { id: number } = {
            id,
            nombre,
            precio,
            categoria,
          };

          await this.db.updateData(offlineFunko);

          await this.syncService.addPendingOperation({
            type: 'UPDATE',
            entity: 'funko',
            data: { id, nombre, precio, categoria, file },
          });

          this.dataChanged$.next();
          console.log('Funko actualizado localmente (offline), pendiente de sincronizar');
          return offlineFunko;
        })(),
      );
    }

    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('price', precio.toString());
    formData.append('categoria', categoria);
    if (file) {
      formData.append('file', file);
    }

    return this.http
      .put<Funko>(`${this.API_URL}/${id}`, formData, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        timeout(this.REQUEST_TIMEOUT_MS),
        tap({
          next: async (funko) => {
            try {
              if (funko.id) {
                await this.db.updateData(funko as Funko & { id: number });
                this.dataChanged$.next();
              }
            } catch (err) {
              console.warn('Error actualizando funko en IndexDB:', err);
            }
          },
          error: (err) => console.error('Error actualizando funko:', err),
        }),
        catchError((error) => {
          console.warn('Sin conexión, actualizando en IndexDB');
          return from(
            (async () => {
              const offlineFunko: Funko & { id: number } = {
                id,
                nombre,
                precio,
                categoria,
              };

              // Actualizar en IndexDB
              await this.db.updateData(offlineFunko);

              // Registrar operación pendiente
              await this.syncService.addPendingOperation({
                type: 'UPDATE',
                entity: 'funko',
                data: { id, nombre, precio, categoria, file },
              });

              this.dataChanged$.next();
              console.log('Funko actualizado localmente, se sincronizará cuando haya conexión');
              return offlineFunko;
            })(),
          );
        }),
      );
  }

  deleteFunko(id: number): Observable<void> {
    if (!navigator.onLine) {
      return from(
        (async () => {
          await this.db.deleteData(id);
          await this.syncService.addPendingOperation({
            type: 'DELETE',
            entity: 'funko',
            data: { id },
          });
          this.dataChanged$.next();
          console.log('Funko eliminado localmente (offline), pendiente de sincronizar');
        })(),
      );
    }

    return this.http
      .delete<void>(`${this.API_URL}/${id}`, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        timeout(this.REQUEST_TIMEOUT_MS),
        tap({
          next: async () => {
            try {
              await this.db.deleteData(id);
              this.dataChanged$.next();
            } catch (err) {
              console.warn('Error eliminando funko de IndexDB:', err);
            }
          },
          error: (err) => console.error('Error eliminando funko:', err),
        }),
        catchError((error) => {
          console.warn('Sin conexión, eliminando de IndexDB');
          return from(
            (async () => {
              // Eliminar de IndexDB
              await this.db.deleteData(id);

              // Registrar operación pendiente
              await this.syncService.addPendingOperation({
                type: 'DELETE',
                entity: 'funko',
                data: { id },
              });
              this.dataChanged$.next();
            })(),
          );
        }),
      );
  }

  /**
   * Ejecuta una operación pendiente (llamado por SyncService)
   */
  async executePendingOperation(operation: any): Promise<void> {
    const { type, data } = operation;

    try {
      switch (type) {
        case 'CREATE':
          const newFunko = await this.createFunkoSync(
            data.nombre,
            data.precio,
            data.categoria,
            data.file,
            data.localId, // Pasar ID local para actualizar después
          );
          // Si hay ID local, eliminar el viejo y guardar el nuevo con ID servidor
          if (data.localId) {
            try {
              await this.db.deleteData(data.localId);
            } catch (e) {
              console.warn('No se pudo eliminar funko local:', e);
            }
          }
          if (newFunko && newFunko.id) {
            await this.db.updateData(newFunko as Funko & { id: number }); // usamos updateData para asegurar inserción/reemplazo
          }
          break;
        case 'UPDATE':
          const updatedFunko = await this.updateFunkoSync(
            data.id,
            data.nombre,
            data.precio,
            data.categoria,
            data.file,
          );
          // Actualizar en IndexDB también con los datos devueltos por el servidor
          if (updatedFunko) {
            await this.db.updateData(updatedFunko as Funko & { id: number });
          }
          break;
        case 'DELETE':
          await this.deleteFunkoSync(data.id);
          // Eliminar de IndexDB también
          try {
            await this.db.deleteData(data.id);
          } catch (e) {
            console.warn('Error eliminando de IndexDB:', e);
          }
          break;
        default:
          throw new Error(`Tipo de operación desconocido: ${type}`);
      }
      console.log(`Operación ${type} ejecutada correctamente`);
    } catch (error) {
      console.error(`Error ejecutando operación ${type}:`, error);
      throw error;
    }
  }

  private async createFunkoSync(
    nombre: string,
    precio: number,
    categoria: string,
    file: File | null,
    localId?: number,
  ): Promise<Funko> {
    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('price', precio.toString());
    formData.append('categoria', categoria);
    if (file) {
      formData.append('file', file);
    }

    return firstValueFrom(
      this.http
        .post<Funko>(this.API_URL, formData, {
          headers: this.getAuthHeaders(),
        })
        .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
    );
  }

  private async updateFunkoSync(
    id: number,
    nombre: string,
    precio: number,
    categoria: string,
    file: File | null,
  ): Promise<Funko> {
    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('price', precio.toString());
    formData.append('categoria', categoria);
    if (file) {
      formData.append('file', file);
    }

    return firstValueFrom(
      this.http
        .put<Funko>(`${this.API_URL}/${id}`, formData, {
          headers: this.getAuthHeaders(),
        })
        .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
    );
  }

  private async deleteFunkoSync(id: number): Promise<void> {
    await firstValueFrom(
      this.http
        .delete<void>(`${this.API_URL}/${id}`, {
          headers: this.getAuthHeaders(),
        })
        .pipe(timeout(this.REQUEST_TIMEOUT_MS)),
    );
  }
}
