/**
 * Gera os modelos 3D de demonstracao do restaurante "Brasa & Mesa".
 *
 * Por que gerar em vez de baixar: o produto precisa de assets com dimensoes
 * fisicas conhecidas e origem previsivel. Modelos de terceiros vem com unidade,
 * pivo e orientacao arbitrarios, o que quebra a promessa de escala 1:1.
 *
 * Convencoes de todo modelo produzido aqui:
 *   - 1 unidade de cena = 1 metro (glTF 2.0);
 *   - Y para cima;
 *   - origem no centro da base, ou seja, o modelo "apoia" em y = 0;
 *   - textura e relevo gerados por codigo em `lib/texturas.mjs`, mais cor por
 *     vertice para o que e especifico de cada peca.
 *
 * Cada prato sai em dois formatos:
 *   .glb   - WebXR e o visualizador 3D, no Android e no desktop;
 *   .usdz  - AR Quick Look, o unico caminho de AR nativa no iPhone.
 *
 * Uso: node scripts/generate-demo-models.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

import { instalarCanvasNode } from './lib/canvas-node.mjs';
import { cm } from './lib/modelagem.mjs';
import {
  construirAneis,
  construirBatata,
  construirBrownie,
  construirCostela,
  construirHamburguer,
  construirMilkshake,
  construirPetitGateau,
  construirPizza,
  construirRefrigerante,
  construirSalada,
} from './lib/pratos.mjs';

// Os exportadores convertem textura passando por um <canvas>, e serializam o
// binario com FileReader. Nenhum dos dois existe no Node; estes polyfills
// entregam exatamente o caminho que eles percorrem.
instalarCanvasNode();

// Node ja tem Blob, entao para o FileReader basta a ponte para ArrayBuffer.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer;
          this.onloadend?.();
        })
        .catch((error) => this.onerror?.(error));
    }
  };
}

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/demo-models');

const MODELOS = [
  {
    file: 'smash-bacon',
    build: () =>
      construirHamburguer({ raio: cm(5.9), camadas: ['carne', 'queijo', 'bacon', 'carne', 'queijo'] }),
  },
  {
    file: 'burger-da-casa',
    build: () =>
      construirHamburguer({ raio: cm(6.2), camadas: ['carne', 'queijo', 'alface', 'tomate', 'cebola'] }),
  },
  { file: 'pizza-margherita', build: () => construirPizza({ raioCm: 15, cobertura: 'margherita' }) },
  { file: 'pizza-pepperoni', build: () => construirPizza({ raioCm: 15, cobertura: 'pepperoni' }) },
  { file: 'batata-crocante', build: construirBatata },
  { file: 'aneis-de-cebola', build: construirAneis },
  { file: 'brownie', build: construirBrownie },
  { file: 'petit-gateau', build: construirPetitGateau },
  { file: 'milkshake', build: construirMilkshake },
  { file: 'refrigerante', build: construirRefrigerante },
  { file: 'costela-defumada', build: construirCostela },
  { file: 'salada-caesar', build: construirSalada },
];

/**
 * Reposiciona o modelo para que fique centrado em X/Z e apoiado em y = 0.
 *
 * Os construtores ja tentam respeitar isso, mas deformacao e pecas soltas
 * deslocam a caixa envolvente por alguns milimetros. Normalizar aqui garante a
 * convencao para todos, em vez de depender de cada prato acertar sozinho.
 */
function assentarNaOrigem(objeto) {
  objeto.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(objeto);
  const centro = new THREE.Vector3();
  caixa.getCenter(centro);
  objeto.position.x -= centro.x;
  objeto.position.z -= centro.z;
  objeto.position.y -= caixa.min.y;
  objeto.updateMatrixWorld(true);
}

/**
 * O USDZ e um zip com duas regras que o Quick Look verifica em silencio: nada
 * pode estar comprimido, e o conteudo de cada arquivo precisa comecar num
 * offset multiplo de 64 bytes. Violar qualquer uma faz o iPhone abrir uma tela
 * cinza sem mensagem - o tipo de defeito que so aparece no aparelho do cliente.
 */
function validarUsdz(caminho) {
  const dados = readFileSync(caminho);
  const problemas = [];
  let cursor = 0;

  while (cursor + 4 <= dados.length && dados.readUInt32LE(cursor) === 0x04034b50) {
    const metodo = dados.readUInt16LE(cursor + 8);
    const tamanhoComprimido = dados.readUInt32LE(cursor + 18);
    const tamanhoNome = dados.readUInt16LE(cursor + 26);
    const tamanhoExtra = dados.readUInt16LE(cursor + 28);
    const nome = dados.toString('utf8', cursor + 30, cursor + 30 + tamanhoNome);
    const inicioDoConteudo = cursor + 30 + tamanhoNome + tamanhoExtra;

    if (metodo !== 0) problemas.push(`${nome} esta comprimido`);
    if (inicioDoConteudo % 64 !== 0) {
      problemas.push(`${nome} comeca em ${inicioDoConteudo}, fora do alinhamento de 64 bytes`);
    }

    cursor = inicioDoConteudo + tamanhoComprimido;
  }

  if (cursor === 0) problemas.push('nenhuma entrada de zip encontrada');
  return problemas;
}

function contarTriangulos(objeto) {
  let total = 0;
  objeto.traverse((no) => {
    if (!no.isMesh) return;
    const geometry = no.geometry;
    total += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  });
  return Math.round(total);
}

async function exportar({ file, build }) {
  const scene = new THREE.Scene();
  scene.name = file;

  const grupo = build();
  grupo.name = file;
  assentarNaOrigem(grupo);
  scene.add(grupo);

  const caixa = new THREE.Box3().setFromObject(scene);
  const tamanho = new THREE.Vector3();
  caixa.getSize(tamanho);

  const glb = Buffer.from(
    await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }),
  );
  writeFileSync(resolve(OUT_DIR, `${file}.glb`), glb);

  const usdz = Buffer.from(
    await new USDZExporter().parseAsync(scene, {
      quickLookCompatible: true,
      includeAnchoringProperties: true,
      ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
    }),
  );
  writeFileSync(resolve(OUT_DIR, `${file}.usdz`), usdz);

  return {
    file,
    glbKb: Math.round(glb.byteLength / 1024),
    usdzKb: Math.round(usdz.byteLength / 1024),
    triangulos: contarTriangulos(scene),
    baseEmY: Number(caixa.min.y.toFixed(5)),
    sizeCm: [tamanho.x, tamanho.y, tamanho.z].map((v) => Math.round(v * 1000) / 10),
  };
}

mkdirSync(OUT_DIR, { recursive: true });

const resultados = [];
for (const modelo of MODELOS) {
  resultados.push(await exportar(modelo));
}

const invalidos = resultados
  .map((r) => ({ file: r.file, problemas: validarUsdz(resolve(OUT_DIR, `${r.file}.usdz`)) }))
  .filter((r) => r.problemas.length > 0);

if (invalidos.length > 0) {
  for (const { file, problemas } of invalidos) {
    console.error(`USDZ invalido: ${file}.usdz`);
    for (const problema of problemas) console.error(`  - ${problema}`);
  }
  process.exit(1);
}

const desassentados = resultados.filter((r) => Math.abs(r.baseEmY) > 0.0005);
if (desassentados.length > 0) {
  console.error('Modelos que nao apoiam em y = 0:');
  for (const r of desassentados) console.error(`  ${r.file}: base em ${r.baseEmY} m`);
  process.exit(1);
}

console.table(
  resultados.map((r) => ({
    modelo: r.file,
    'GLB (KB)': r.glbKb,
    'USDZ (KB)': r.usdzKb,
    triangulos: r.triangulos,
    'LxAxP (cm)': r.sizeCm.join(' x '),
  })),
);

const totalGlb = resultados.reduce((acc, r) => acc + r.glbKb, 0);
const totalUsdz = resultados.reduce((acc, r) => acc + r.usdzKb, 0);
console.log(`\n${resultados.length} modelos - GLB ${totalGlb} KB, USDZ ${totalUsdz} KB - ${OUT_DIR}`);
console.log('Conferido: USDZ sem compressao e alinhado; todos apoiam em y = 0.');
