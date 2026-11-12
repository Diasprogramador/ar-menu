import QRCode from 'qrcode';

import { env } from '@/lib/env';
import { MARKER_HASH, MARKER_MM } from './tableMarker';

/**
 * Geração de QR Codes.
 *
 * Tudo acontece no navegador: a biblioteca desenha o código a partir da URL, e
 * o restaurante baixa o PNG. Não há serviço externo no caminho — um QR Code
 * gerado por terceiros seria um link que a gente não controla, colado na mesa
 * do cliente.
 */

/** Correção de erro alta: o adesivo vai encardir, molhar e ser tocado. */
const OPTIONS: QRCode.QRCodeToDataURLOptions = {
  errorCorrectionLevel: 'H',
  margin: 2,
  color: { dark: '#14110F', light: '#FFFFFF' },
};

export function buildTargetUrl(path: string): string {
  const base = new URL(env.appUrl || window.location.origin);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/;
  return `${local.test(base.hostname) ? window.location.origin : base.origin}${path}`;
}

export async function generateQrDataUrl(path: string, size = 640): Promise<string> {
  return QRCode.toDataURL(buildTargetUrl(path), { ...OPTIONS, width: size });
}

/** SVG para quem vai levar o arquivo à gráfica: escala sem perder nitidez. */
export async function generateQrSvg(path: string): Promise<string> {
  return QRCode.toString(buildTargetUrl(path), {
    ...OPTIONS,
    type: 'svg',
    width: 640,
  } as QRCode.QRCodeToStringOptions);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  // Revoga depois do clique para o navegador não cancelar o download
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Folha de impressão com todos os códigos.
 *
 * Abre uma janela com HTML próprio em vez de tentar imprimir o painel: o CSS de
 * tela nunca produz uma folha A4 utilizável, e o restaurante precisa recortar
 * os adesivos.
 */
export async function printQrSheet(
  restaurantName: string,
  codes: { label: string; path: string }[],
): Promise<void> {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) {
    throw new Error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
  }

  const rendered = codes.map(code => {
    const url = buildTargetUrl(code.path);
    const matrix = QRCode.create(url + MARKER_HASH, { errorCorrectionLevel: 'M' }).modules;
    // Use physical units and vector modules, avoiding raster rounding in the print driver.
    const paths: string[] = [];
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        if (matrix.get(y, x)) paths.push(`M${x},${y}h1v1h-1Z`);
      }
    }
    return { ...code, url, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_MM}mm" height="${MARKER_MM}mm" viewBox="0 0 ${matrix.size} ${matrix.size}" shape-rendering="crispEdges"><path d="${paths.join('')}"/></svg>` };
  });
  win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>QR Codes — ${escapeHtml(restaurantName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: 'Inter Tight', 'Segoe UI', system-ui, sans-serif; margin: 0; color: #14110F; }
  h1 { font-family: Georgia, serif; font-size: 20px; margin: 0 0 4mm; }
  .subtitle { font-size: 11px; color: #6B655E; margin: 0 0 8mm; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
  .card { border: 1px solid #E4E0DA; border-radius: 6px; padding: 5mm; text-align: center; break-inside: avoid; }
  .card svg { display: block; margin: 8mm auto; }
  .label { font-size: 13px; font-weight: 600; margin: 3mm 0 1mm; }
  .cta { font-size: 10px; color: #6B655E; line-height: 1.35; }
  .url { font-family: ui-monospace, Consolas, monospace; font-size: 8px; color: #97918A; word-break: break-all; margin-top: 2mm; }
</style></head>
<body>
  <h1>${escapeHtml(restaurantName)}</h1>
  <p class="subtitle">Imprima em tamanho real (100%). Confira com uma régua: o quadrado preto deve ter 5 cm de lado. Coloque o cartão deitado sobre a mesa.</p>
  <div class="grid">
    ${rendered
      .map(
        (code) => `<div class="card">
          ${code.svg}
          <p class="label">${escapeHtml(code.label)}</p>
          <p class="cta">Escaneie para ver o cardápio<br>e pedir pela mesa</p>
          <p class="url">${escapeHtml(code.url)}</p>
        </div>`,
      )
      .join('')}
  </div>
</body></html>`);

  win.document.close();
  win.focus();
  win.print();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
