import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SyncService } from '../services/sync.service';

@Component({
  selector: 'app-sync-status',
  imports: [CommonModule],
  template: `
    <div
      class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(92vw,24rem)] animate-fade-in"
    >
      <div
        class="alert shadow-lg backdrop-blur-lg border border-base-content/20 py-2"
        [class.alert-success]="syncService.autoSyncEnabled()"
        [class.alert-neutral]="!syncService.autoSyncEnabled()"
      >
        <div class="flex-1">
          <h3 class="font-bold text-sm">Sincronización automática</h3>
          <div class="text-xs opacity-80">
            {{ syncService.autoSyncEnabled() ? 'Activada' : 'Desactivada' }}
          </div>
        </div>
        <button
          class="btn btn-sm"
          [class.btn-error]="syncService.autoSyncEnabled()"
          [class.btn-success]="!syncService.autoSyncEnabled()"
          (click)="toggleAutoSync()"
        >
          {{ syncService.autoSyncEnabled() ? 'Desactivar' : 'Activar' }}
        </button>
      </div>

      <!-- Badge de estado de conexión mejorado -->
      @if (!syncService.isOnline()) {
        <div
          class="alert alert-warning shadow-lg backdrop-blur-lg border border-warning/30 animate-slide-in-right py-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-6 w-6 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
            />
          </svg>
          <div>
            <h3 class="font-bold flex items-center gap-2">
              <span class="relative flex h-3 w-3">
                <span
                  class="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"
                ></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-warning"></span>
              </span>
              Sin conexión
            </h3>
            <div class="text-xs">Modo offline activado</div>
          </div>
        </div>
      }

      <!-- Badge de operaciones pendientes mejorado -->
      @if (syncService.pendingCount() > 0) {
        <div
          class="alert alert-info shadow-lg backdrop-blur-lg border border-info/30 animate-slide-in-right py-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div class="flex-1">
            <h3 class="font-bold text-sm">
              {{ syncService.pendingCount() }} operación{{
                syncService.pendingCount() > 1 ? 'es' : ''
              }}
              pendiente{{ syncService.pendingCount() > 1 ? 's' : '' }}
            </h3>
            <div class="text-xs">
              @if (syncService.autoSyncEnabled()) {
                Se sincronizarán cuando haya conexión
              } @else {
                Auto-sync desactivado
              }
            </div>
          </div>
          @if (syncService.isOnline() && !syncService.isSyncing()) {
            <button
              class="btn btn-sm btn-primary gap-2 shadow-lg hover:scale-105 transition-transform"
              (click)="activateAndSync()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {{ syncService.autoSyncEnabled() ? 'Sincronizar' : 'Activar' }}
            </button>
          }
        </div>
      }

      <!-- Indicador de sincronización mejorado -->
      @if (syncService.isSyncing()) {
        <div
          class="alert alert-success shadow-lg backdrop-blur-lg border border-success/30 animate-slide-in-right py-2"
        >
          <span class="loading loading-spinner loading-md text-success"></span>
          <div>
            <h3 class="font-bold flex items-center gap-2">
              <span class="relative flex h-3 w-3">
                <span
                  class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
                ></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
              </span>
              Sincronizando...
            </h3>
            <div class="text-xs">Subiendo cambios al servidor</div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      @keyframes fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes slide-in-right {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .animate-fade-in {
        animation: fade-in 0.3s ease-out;
      }

      .animate-slide-in-right {
        animation: slide-in-right 0.3s ease-out;
      }
    `,
  ],
})
export class SyncStatus {
  protected syncService = inject(SyncService);

  toggleAutoSync(): void {
    this.syncService.toggleAutoSync();
  }

  activateAndSync(): void {
    this.syncService.activateAndSync();
  }
}
