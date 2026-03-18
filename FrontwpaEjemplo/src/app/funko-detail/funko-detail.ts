import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Funko } from '../services/funko.service';
import { AuthService } from '../services/auth.service';
import { QRCodeComponent } from 'angularx-qrcode';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import JsBarcode from 'jsbarcode';

@Component({
  selector: 'app-funko-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, QRCodeComponent, ZXingScannerModule],
  templateUrl: './funko-detail.html',
  styleUrl: './funko-detail.css',
})
export class FunkoDetail implements OnInit {
  private route = inject(ActivatedRoute);
  protected authService = inject(AuthService);

  funko: Funko | null = null;
  loading: boolean = false;
  error: string = '';

  showQR: boolean = false;
  showBarcode: boolean = false;
  showScanner: boolean = false;
  scannedResult: string = '';

  allowedFormats = [BarcodeFormat.QR_CODE];

  ngOnInit(): void {
    const state = window.history.state;
    if (state && state['funko']) {
      this.funko = state['funko'];
    } else {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this.error = 'No se encontraron los datos del funko';
      }
    }
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

  generateQR(): void {
    this.showQR = true;
    this.showBarcode = false;
    this.showScanner = false;
  }

  generateBarcode(): void {
    this.showBarcode = true;
    this.showQR = false;
    this.showScanner = false;
    
    setTimeout(() => {
      const barcodeElement = document.getElementById('barcode-img');
      if (barcodeElement && this.funko?.id) {
        const barcodeValue = this.getBarcodeValue();
        JsBarcode(barcodeElement, barcodeValue, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
          background: '#ffffff',
          lineColor: '#000000',
          valid: function(_valid: boolean) {}
        });
      }
    }, 200);
  }

  toggleScanner(): void {
    this.showScanner = !this.showScanner;
    this.showQR = false;
    this.showBarcode = false;
  }

  onScanSuccess(result: string): void {
    this.scannedResult = result;
    console.log('Código escaneado:', result);
  }

  printCode(): void {
    const url = this.getQRData();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const isQR = this.showQR;
      let codeHtml = '';
      
      if (isQR) {
        const qrCanvas = document.querySelector('#qr-area canvas') as HTMLCanvasElement;
        if (qrCanvas) {
          codeHtml = `<img src="${qrCanvas.toDataURL('image/png')}" alt="QR Code" style="max-width: 250px;"/>`;
        }
      } else {
        const barcodeImg = document.getElementById('barcode-img') as HTMLImageElement;
        if (barcodeImg && barcodeImg.src) {
          codeHtml = `<img src="${barcodeImg.src}" alt="Barcode" style="max-width: 300px;"/>`;
        }
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir Código - ${this.funko?.nombre}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 40px;
              }
              .container {
                border: 2px solid #333;
                border-radius: 10px;
                padding: 30px;
                max-width: 400px;
                margin: 0 auto;
              }
              h2 { margin-bottom: 10px; color: #333; }
              .url { 
                font-size: 12px; 
                color: #666; 
                word-break: break-all; 
                margin: 10px 0;
                font-family: monospace;
              }
              .id-badge {
                background: #6366f1;
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                font-size: 14px;
                display: inline-block;
                margin-bottom: 15px;
              }
              @media print {
                body { padding: 20px; }
                .container { border: 1px solid #000; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <span class="id-badge">ID: ${this.funko?.id}</span>
              <h2>${this.funko?.nombre}</h2>
              ${codeHtml}
              <p class="url">${url}</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }

  downloadQR(): void {
    const qrCanvas = document.querySelector('#qr-area canvas') as HTMLCanvasElement;
    if (qrCanvas) {
      const link = document.createElement('a');
      link.download = `funko-${this.funko?.id}-qr.png`;
      link.href = qrCanvas.toDataURL('image/png');
      link.click();
    }
  }

  downloadBarcode(): void {
    const barcodeImg = document.getElementById('barcode-img') as HTMLImageElement;
    if (barcodeImg && barcodeImg.src) {
      const link = document.createElement('a');
      link.download = `funko-${this.funko?.id}-barcode.png`;
      link.href = barcodeImg.src;
      link.click();
    }
  }

  closeModal(): void {
    this.showQR = false;
    this.showBarcode = false;
    this.showScanner = false;
    this.scannedResult = '';
  }

  getQRData(): string {
    if (!this.funko) return '';
    return `${window.location.origin}/funko/detail/${this.funko.id}`;
  }

  getBarcodeValue(): string {
    if (!this.funko) return '';
    return `${window.location.origin}/funko/detail/${this.funko.id}`;
  }
}
