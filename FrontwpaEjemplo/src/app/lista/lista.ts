import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FunkoService, Funko } from '../services/funko.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-lista',
  imports: [CommonModule, RouterLink],
  templateUrl: './lista.html',
  styleUrl: './lista.css',
})
export class Lista implements OnInit {
  private funkoService = inject(FunkoService);
  private router = inject(Router);
  protected authService = inject(AuthService);

  funkos: Funko[] = [];
  loading: boolean = true;

  ngOnInit(): void {
    this.loadFunkos();
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
        this.loading = false;
      },
    });
  }

  getImageUrl(imagen?: string): string {
    if (!imagen || imagen === 'default.png' || imagen === 'pending-upload.png') {
      return 'https://via.placeholder.com/300x300?text=Sin+Imagen';
    }
    if (imagen.startsWith('http')) {
      return imagen;
    }
    return `https://pruebaanteproyecto.onrender.com/uploads/${imagen}`;
  }

  goToDetail(funko: Funko): void {
    this.router.navigate(['/funko/detail', funko.id], { state: { funko } });
  }
}
