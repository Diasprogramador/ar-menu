import QRCode from 'qrcode';

import { env } from '@/lib/env';

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
  const base = env.appUrl || window.location.origin;
  return `${base}${path}`;
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
  const rendered = await Promise.all(
    codes.map(async (code) => ({
      ...code,
      dataUrl: await generateQrDataUrl(code.path, 420),
      url: buildTargetUrl(code.path),
    })),
  );

  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) {
    throw new Error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
  }

  win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>QR Codes — ${escapeHtml(restaurantName)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: 'Inter Tight', 'Segoe UI', system-ui, sans-serif; margin: 0; color: #14110F; }
  h1 { font-family: Georgia, serif; font-size: 20px; margin: 0 0 4mm; }
  .subtitle { font-size: 11px; color: #6B655E; margin: 0 0 8mm; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
  .card { border: 1px solid #E4E0DA; border-radius: 6px; padding: 5mm; text-align: center; break-inside: avoid; }
  .card img { width: 100%; height: auto; display: block; }
  .label { font-size: 13px; font-weight: 600; margin: 3mm 0 1mm; }
  .cta { font-size: 10px; color: #6B655E; line-height: 1.35; }
  .url { font-family: ui-monospace, Consolas, monospace; font-size: 8px; color: #97918A; word-break: break-all; margin-top: 2mm; }
</style></head>
<body>
  <h1>${escapeHtml(restaurantName)}</h1>
  <p class="subtitle">Aponte a câmera do celular para ver o cardápio e os pratos em realidade aumentada.</p>
  <div class="grid">
    ${rendered
      .map(
        (code) => `<div class="card">
          <img src="${code.dataUrl}" alt="QR Code ${escapeHtml(code.label)}">
          <p class="label">${escapeHtml(code.label)}</p>
          <p class="cta">Escaneie para ver o cardápio<br>e pedir pela mesa</p>
          <p class="url">${escapeHtml(code.url)}</p>
        </div>`,
      )
      .join('')}
  </div>
</body></html>`);

  win.document.close();
  win.addEventListener('load', () => {
    win.focus();
    win.print();
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
