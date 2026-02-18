import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, from, firstValueFrom } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
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

  private readonly API_URL = 'https://pruebaanteproyecto.onrender.com/api/funkos';

  constructor() {
    // Registrar este servicio en SyncService para evitar dependencia circular
    this.syncService.setFunkoService(this);
    
    // Intentar sincronizar al arrancar si hay conexión
    if (navigator.onLine) {
      this.syncService.syncPendingOperations();
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  getFunkos(): Observable<Funko[]> {
    return this.http.get<Funko[]>(this.API_URL).pipe(
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
    return this.http.get<Funko>(`${this.API_URL}/${id}`).pipe(
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
        tap({
          next: async (funko) => {
            try {
              await this.db.addData(funko);
            } catch (err) {
              console.warn('Error guardando funko creado en IndexDB:', err);
            }
          },
          error: (err) => console.error('Error creando funko:', err),
        }),
        catchError((error) => {
          console.warn('Sin conexión, guardando en IndexDB como pendiente');
          return from((async () => {
            const offlineFunko: Funko = {
              nombre,
              precio,
              categoria,
              imagen: 'pending-upload.png',
            };
            
            // Guardar en IndexDB
            const localId = await this.db.addData(offlineFunko);
            const savedFunko = { ...offlineFunko, id: localId };
            
            // Registrar operación pendiente
            await this.syncService.addPendingOperation({
              type: 'CREATE',
              entity: 'funko',
              data: { nombre, precio, categoria, file },
            });
            
            console.log('Funko guardado localmente, se sincronizará cuando haya conexión');
            return savedFunko;
          })());
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
        tap({
          next: async (funko) => {
            try {
              if (funko.id) {
                await this.db.updateData(funko as Funko & { id: number });
              }
            } catch (err) {
              console.warn('Error actualizando funko en IndexDB:', err);
            }
          },
          error: (err) => console.error('Error actualizando funko:', err),
        }),
        catchError((error) => {
          console.warn('Sin conexión, actualizando en IndexDB');
          return from((async () => {
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
            
            console.log('Funko actualizado localmente, se sincronizará cuando haya conexión');
            return offlineFunko;
          })());
        }),
      );
  }

  deleteFunko(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.API_URL}/${id}`, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        tap({
          next: async () => {
            try {
              await this.db.deleteData(id);
            } catch (err) {
              console.warn('Error eliminando funko de IndexDB:', err);
            }
          },
          error: (err) => console.error('Error eliminando funko:', err),
        }),
        catchError((error) => {
          console.warn('Sin conexión, eliminando de IndexDB');
          return from((async () => {
            // Eliminar de IndexDB
            await this.db.deleteData(id);
            
            // Registrar operación pendiente
            await this.syncService.addPendingOperation({
              type: 'DELETE',
              entity: 'funko',
              data: { id },
            });
          })());
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
          await this.createFunkoSync(data.nombre, data.precio, data.categoria, data.file);
          break;
        case 'UPDATE':
          await this.updateFunkoSync(data.id, data.nombre, data.precio, data.categoria, data.file);
          break;
        case 'DELETE':
          await this.deleteFunkoSync(data.id);
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

  private async createFunkoSync(nombre: string, precio: number, categoria: string, file: File | null): Promise<void> {
    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('price', precio.toString());
    formData.append('categoria', categoria);
    if (file) {
      formData.append('file', file);
    }

    await firstValueFrom(this.http.post<Funko>(this.API_URL, formData, {
      headers: this.getAuthHeaders(),
    }));
  }

  private async updateFunkoSync(id: number, nombre: string, precio: number, categoria: string, file: File | null): Promise<void> {
    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('price', precio.toString());
    formData.append('categoria', categoria);
    if (file) {
      formData.append('file', file);
    }

    await firstValueFrom(this.http.put<Funko>(`${this.API_URL}/${id}`, formData, {
      headers: this.getAuthHeaders(),
    }));
  }

  private async deleteFunkoSync(id: number): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.API_URL}/${id}`, {
      headers: this.getAuthHeaders(),
    }));
  }
}
