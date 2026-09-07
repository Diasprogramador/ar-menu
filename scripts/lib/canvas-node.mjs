/**
 * Canvas 2D mínimo para o Node, suficiente para os exportadores do three.js.
 *
 * Tanto o `GLTFExporter` quanto o `USDZExporter` convertem textura passando por
 * um `<canvas>`: desenham a imagem nele e pedem os bytes com `toBlob`. No Node
 * não existe canvas, e a alternativa usual — o pacote `canvas`, que compila
 * código nativo — é pesada demais para um gerador de assets que roda uma vez.
 *
 * Este polyfill implementa só o caminho que os exportadores percorrem:
 *
 *   getContext('2d') → translate/scale (para flipY) → putImageData ou drawImage
 *   → toBlob(callback, 'image/png')
 *
 * Os pixels ficam guardados como estão e são codificados em PNG na hora do
 * `toBlob`. Nada é rasterizado de verdade, porque nada precisa ser: a origem já
 * é um buffer RGBA.
 */
import { encodePng } from './png.mjs';

/**
 * Buffer de pixels que os exportadores reconhecem como imagem.
 *
 * O `USDZExporter` recusa qualquer imagem que nao seja `instanceof` de um dos
 * tipos do browser. Registrando esta classe como `ImageBitmap` global e usando
 * instancias dela nas texturas, a verificacao passa sem precisar mexer no
 * exportador nem carregar uma implementacao nativa de canvas.
 */
export class ImagemDePixels {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

class ContextoFalso {
  constructor(canvas) {
    this.canvas = canvas;
    this.espelharVertical = false;
  }

  translate(_x, y) {
    // O exportador chama translate(0, altura) seguido de scale(1, -1) para
    // inverter o eixo V. Guardamos a intenção e aplicamos no fim.
    if (y !== 0) this.espelharVertical = true;
  }

  scale(_x, y) {
    if (y === -1) this.espelharVertical = true;
  }

  putImageData(imageData) {
    this.canvas.pixels = Buffer.from(imageData.data);
    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;
  }

  /** O caminho do USDZExporter: recebe o objeto de imagem da textura. */
  drawImage(imagem) {
    if (!imagem?.data) {
      throw new Error('canvas-node: drawImage só aceita imagem com buffer de pixels (DataTexture).');
    }
    this.canvas.pixels = Buffer.from(imagem.data);
    this.canvas.width = imagem.width;
    this.canvas.height = imagem.height;
  }

  getImageData(_x, _y, largura, altura) {
    return { data: this.canvas.pixels, width: largura, height: altura };
  }
}

class CanvasFalso {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.pixels = null;
    this.contexto = null;
  }

  /**
   * O exportador reconstroi o normal map num canvas — inverte o canal verde
   * para a convencao do glTF — e usa esse canvas como fonte da nova textura.
   * Expondo `data`, o canvas passa pela mesma verificacao que uma DataTexture,
   * e o caminho seguinte funciona sem tratamento especial.
   */
  get data() {
    return this.pixels;
  }

  getContext(tipo) {
    if (tipo !== '2d') return null;
    this.contexto ??= new ContextoFalso(this);
    return this.contexto;
  }

  toDataURL() {
    return `data:image/png;base64,${this.paraPng().toString('base64')}`;
  }

  toBlob(callback, mimeType = 'image/png') {
    callback(new Blob([this.paraPng()], { type: mimeType }));
  }

  paraPng() {
    if (!this.pixels) throw new Error('canvas-node: nada foi desenhado neste canvas.');

    let pixels = this.pixels;
    if (this.contexto?.espelharVertical) {
      const linha = this.width * 4;
      const invertido = Buffer.alloc(pixels.length);
      for (let y = 0; y < this.height; y += 1) {
        pixels.copy(invertido, y * linha, (this.height - 1 - y) * linha, (this.height - y) * linha);
      }
      pixels = invertido;
    }

    return encodePng(this.width, this.height, pixels);
  }
}

/** Instala os globais que os exportadores procuram. Idempotente. */
export function instalarCanvasNode() {
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }

  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement(tag) {
        if (tag === 'canvas') return new CanvasFalso();
        throw new Error(`canvas-node: elemento "${tag}" não é suportado.`);
      },
      createElementNS(_ns, tag) {
        return this.createElement(tag);
      },
    };
  }

  // O GLTFExporter prefere OffscreenCanvas quando existe; garantimos que não
  // exista, para que ele caia no nosso `document.createElement`.
  if (typeof globalThis.OffscreenCanvas !== 'undefined') {
    delete globalThis.OffscreenCanvas;
  }

  // O USDZExporter valida a imagem por `instanceof`. Estes dois registros fazem
  // as nossas texturas e o nosso canvas passarem nessa verificação.
  globalThis.ImageBitmap = ImagemDePixels;
  globalThis.HTMLCanvasElement = CanvasFalso;
}
