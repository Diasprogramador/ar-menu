/**
 * Codificador PNG mínimo, em RGBA.
 *
 * Existe porque os exportadores do three.js serializam textura através de um
 * `<canvas>`, que o Node não tem. Em vez de trazer uma dependência nativa de
 * canvas — que precisa compilar e quebra em CI — este módulo, junto com o
 * polyfill de canvas, entrega exatamente o que os exportadores pedem: bytes de
 * PNG.
 */
import { deflateSync } from 'node:zlib';

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = TABELA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([tamanho, corpo, crc]);
}

/**
 * Codifica pixels RGBA em PNG.
 *
 * Usa o filtro Paeth por linha: para ruído e gradiente — que é tudo o que estas
 * texturas contêm — ele reduz o arquivo a uma fração do filtro nulo.
 */
export function encodePng(largura, altura, rgba) {
  const bytesPorLinha = largura * 4;
  const cru = Buffer.alloc((bytesPorLinha + 1) * altura);

  for (let y = 0; y < altura; y += 1) {
    const destino = y * (bytesPorLinha + 1);
    cru[destino] = 4; // filtro Paeth

    for (let x = 0; x < bytesPorLinha; x += 1) {
      const atual = rgba[y * bytesPorLinha + x];
      const esquerda = x >= 4 ? rgba[y * bytesPorLinha + x - 4] : 0;
      const acima = y > 0 ? rgba[(y - 1) * bytesPorLinha + x] : 0;
      const diagonal = x >= 4 && y > 0 ? rgba[(y - 1) * bytesPorLinha + x - 4] : 0;

      const p = esquerda + acima - diagonal;
      const pa = Math.abs(p - esquerda);
      const pb = Math.abs(p - acima);
      const pc = Math.abs(p - diagonal);
      const previsto = pa <= pb && pa <= pc ? esquerda : pb <= pc ? acima : diagonal;

      cru[destino + 1 + x] = (atual - previsto) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(cru, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}
