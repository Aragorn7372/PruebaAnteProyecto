import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FunkoService, Funko } from '../services/funko.service';
import { AuthService } from '../services/auth.service';
import { IndexDbService } from '../services/indexdb.service';
import { SyncService } from '../services/sync.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-lista',
  imports: [CommonModule, RouterLink],
  templateUrl: './lista.html',
  styleUrl: './lista.css',
})
export class Lista implements OnInit, OnDestroy {
  private funkoService = inject(FunkoService);
  private db = inject(IndexDbService);
  private router = inject(Router);
  protected authService = inject(AuthService);
  private syncService = inject(SyncService);
  private destroy$ = new Subject<void>();
  private readonly apiBaseUrl = 'https://pruebaanteproyecto.onrender.com';
  private readonly fallbackImage =
    'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22360%22 height=%22360%22 viewBox=%220 0 360 360%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%25%22 y1=%220%25%22 x2=%22100%25%22 y2=%22100%25%22%3E%3Cstop offset=%220%25%22 stop-color=%22%231b2335%22/%3E%3Cstop offset=%22100%25%22 stop-color=%22%232b1f4a%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22360%22 height=%22360%22 fill=%22url(%23g)%22/%3E%3Ctext x=%2250%25%22 y=%2247%25%22 text-anchor=%22middle%22 fill=%22%23cbd5e1%22 font-family=%22Arial,sans-serif%22 font-size=%2234%22%3ESin imagen%3C/text%3E%3Ctext x=%2250%25%22 y=%2258%25%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-family=%22Arial,sans-serif%22 font-size=%2218%22%3EFunkoStore%3C/text%3E%3C/svg%3E';

  funkos: Funko[] = [];
  loading: boolean = true;

  ngOnInit(): void {
    this.loadFunkos();

    // Recargar funkos cuando se completa la sincronización
    this.syncService
      .onSyncCompleted()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('Sincronización completada, recargando funkos...');
        this.loadFunkos();
      });

    // Recargar funkos cuando hay cambios en los datos
    this.funkoService
      .onDataChanged()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('Datos de funkos cambiados, recargando...');
        this.loadFunkos();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFunkos(): void {
    this.loading = true;
    this.funkoService.getFunkos().subscribe({
      next: (data) => {
        console.log('Datos recibidos:', data);
        this.funkos = data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error al cargar funkos:', error);
        this.db
          .getAllData<Funko>()
          .then((data) => {
            this.funkos = data;
          })
          .catch((dbError) => {
            console.error('Error cargando funkos locales:', dbError);
          })
          .finally(() => {
            this.loading = false;
          });
      },
    });
  }

  getImageUrl(imagen?: string): string {
    if (!imagen || imagen === 'default.png' || imagen === 'pending-upload.png') {
      return this.fallbackImage;
    }

    if (imagen.startsWith('http://') || imagen.startsWith('https://')) {
      return imagen;
    }

    const normalizedImage = imagen.replace(/\\/g, '/').replace(/^\/+/, '');

    if (normalizedImage.startsWith('uploads/')) {
      return `${this.apiBaseUrl}/${normalizedImage}`;
    }

    return `${this.apiBaseUrl}/uploads/${normalizedImage}`;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img || img.src === this.fallbackImage) {
      return;
    }
    img.src = this.fallbackImage;
  }

  goToDetail(funko: Funko): void {
    this.router.navigate(['/funko/detail', funko.id], { state: { funko } });
  }
}
