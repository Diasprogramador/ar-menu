/**
 * Gera os modelos GLB de demonstracao do restaurante "Brasa & Mesa".
 *
 * Por que gerar em vez de baixar: o produto precisa de assets com dimensoes
 * fisicas conhecidas e origem previsivel. Modelos de terceiros vem com unidade,
 * pivo e orientacao arbitrarios, o que quebra a promessa de escala 1:1.
 *
 * Convencoes de todo modelo produzido aqui:
 *   - 1 unidade de cena = 1 metro (glTF 2.0);
 *   - Y para cima;
 *   - origem no centro da base, ou seja, o modelo "apoia" em y = 0;
 *   - sem texturas: apenas materiais PBR por cor, para manter o arquivo leve.
 *
 * Cada prato sai em dois formatos:
 *   .glb   - WebXR e o visualizador 3D, no Android e no desktop;
 *   .usdz  - AR Quick Look, o unico caminho de AR nativa no iPhone.
 *
 * O USDZ e exportado com ancoragem em plano horizontal e `quickLookCompatible`,
 * porque o visualizador da Apple aceita um subconjunto menor de materiais PBR
 * que o three.js.
 *
 * Uso: node scripts/generate-demo-models.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

// GLTFExporter serializa o buffer binario com FileReader, que so existe no
// browser. Node ja tem Blob, entao basta a ponte para ArrayBuffer.
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

const cm = (v) => v / 100;

const mat = (color, { roughness = 0.72, metalness = 0, transparent = false, opacity = 1 } = {}) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness,
    metalness,
    transparent,
    opacity,
    side: transparent ? THREE.DoubleSide : THREE.FrontSide,
  });

/** Cilindro com a base apoiada em `y`. */
function disc(radiusTop, radiusBottom, height, material, y = 0, segments = 48) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.y = y + height / 2;
  return mesh;
}

/** Meia esfera achatada, util para pao, sorvete e chantilly. */
function dome(radius, squash, material, y = 0, segments = 32) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, Math.max(8, segments / 2), 0, Math.PI * 2, 0, Math.PI / 2),
    material,
  );
  mesh.scale.y = squash;
  mesh.position.y = y;
  return mesh;
}

function box(w, h, d, material, position = [0, 0, 0], rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = rotationY;
  return mesh;
}

/** Distribui `count` copias em circulo, com jitter deterministico. */
function ring(count, radius, build, seed = 1) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + seed * 0.37;
    const jitter = Math.sin(i * 12.9898 + seed) * 0.5 + 0.5;
    group.add(build(Math.cos(angle) * radius, Math.sin(angle) * radius, jitter, i));
  }
  return group;
}

const PALETTE = {
  bunTop: '#D9A05B',
  bunBottom: '#C98F49',
  patty: '#4A2A1C',
  cheese: '#F2B33D',
  bacon: '#A63A25',
  lettuce: '#5C8C3A',
  tomato: '#C0392B',
  onion: '#E8D5C4',
  dough: '#E3C08B',
  crust: '#C89A5B',
  sauce: '#B03A2E',
  mozzarella: '#F5EFE0',
  basil: '#3E7C3A',
  pepperoni: '#9E2B25',
  potato: '#E0A93C',
  paper: '#E8E2D6',
  batter: '#D9A24E',
  chocolate: '#3B2117',
  vanilla: '#F6EFDD',
  strawberry: '#E5799B',
  glass: '#DCE6EA',
  cola: '#3A1E10',
  ice: '#EAF4F7',
  plate: '#F1EDE6',
  rib: '#5A2B1B',
  glaze: '#7A2E17',
  greens: '#4F8B3B',
  parmesan: '#EFD9A0',
  crouton: '#D8B67A',
  bowl: '#2F3437',
};

// ---------------------------------------------------------------------------
// Construtores de prato
// ---------------------------------------------------------------------------

function buildBurger({ radius, layers }) {
  const group = new THREE.Group();
  let y = 0;

  group.add(disc(radius * 0.96, radius * 0.88, cm(1.6), mat(PALETTE.bunBottom), y));
  y += cm(1.6);

  for (const layer of layers) {
    switch (layer.type) {
      case 'patty':
        group.add(disc(radius * 1.02, radius * 1.0, cm(1.8), mat(PALETTE.patty, { roughness: 0.9 }), y));
        y += cm(1.8);
        break;
      case 'cheese': {
        const cheese = disc(radius * 1.05, radius * 1.05, cm(0.3), mat(PALETTE.cheese, { roughness: 0.45 }), y);
        group.add(cheese);
        // pontas escorrendo pelas laterais
        group.add(
          ring(6, radius * 1.0, (x, z, j) => {
            const drip = new THREE.Mesh(
              new THREE.SphereGeometry(cm(0.5 + j * 0.4), 10, 8),
              mat(PALETTE.cheese, { roughness: 0.45 }),
            );
            drip.position.set(x, y - cm(0.4 + j * 0.6), z);
            drip.scale.y = 1.6;
            return drip;
          }, 3),
        );
        y += cm(0.3);
        break;
      }
      case 'bacon':
        group.add(
          ring(5, radius * 0.55, (x, z, j, i) => {
            const strip = box(radius * 1.5, cm(0.35), cm(1.6), mat(PALETTE.bacon, { roughness: 0.6 }));
            strip.position.set(x * 0.4, y + cm(0.2), z * 0.4);
            strip.rotation.y = i * 0.6;
            strip.rotation.z = (j - 0.5) * 0.15;
            return strip;
          }, 5),
        );
        y += cm(0.5);
        break;
      case 'lettuce':
        group.add(
          ring(9, radius * 0.92, (x, z, j) => {
            const leaf = new THREE.Mesh(
              new THREE.SphereGeometry(radius * 0.34, 10, 8),
              mat(PALETTE.lettuce, { roughness: 0.85 }),
            );
            leaf.position.set(x, y + cm(0.2), z);
            leaf.scale.set(1, 0.28 + j * 0.12, 1);
            return leaf;
          }, 7),
        );
        y += cm(0.9);
        break;
      case 'tomato':
        group.add(disc(radius * 0.9, radius * 0.9, cm(0.6), mat(PALETTE.tomato, { roughness: 0.5 }), y));
        y += cm(0.6);
        break;
      case 'onion':
        group.add(
          new THREE.Mesh(
            new THREE.TorusGeometry(radius * 0.66, cm(0.35), 8, 32),
            mat(PALETTE.onion, { roughness: 0.7 }),
          ).translateY(y + cm(0.35)).rotateX(Math.PI / 2),
        );
        y += cm(0.7);
        break;
      default:
        break;
    }
  }

  const top = dome(radius, 0.62, mat(PALETTE.bunTop), y);
  group.add(top);
  // gergelim
  group.add(
    ring(14, radius * 0.5, (x, z, j, i) => {
      const seed = new THREE.Mesh(new THREE.SphereGeometry(cm(0.16), 6, 5), mat('#F3E2C0', { roughness: 0.6 }));
      const r = radius * (0.2 + ((i % 4) * 0.18));
      const angle = i * 1.7;
      seed.position.set(Math.cos(angle) * r, y + radius * 0.62 * Math.cos((r / radius) * 1.2) - cm(0.1), Math.sin(angle) * r);
      seed.scale.set(1.6, 0.7, 1);
      return seed;
    }, 11),
  );

  return group;
}

function buildPizza({ radiusCm, topping }) {
  const group = new THREE.Group();
  const r = cm(radiusCm);

  group.add(disc(r, r * 0.98, cm(0.8), mat(PALETTE.dough, { roughness: 0.85 }), 0));
  // borda mais alta
  group.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.94, cm(1.1), 10, 64),
      mat(PALETTE.crust, { roughness: 0.85 }),
    ).translateY(cm(1.0)).rotateX(Math.PI / 2),
  );
  group.add(disc(r * 0.9, r * 0.9, cm(0.25), mat(PALETTE.sauce, { roughness: 0.6 }), cm(0.8)));
  group.add(disc(r * 0.88, r * 0.88, cm(0.3), mat(PALETTE.mozzarella, { roughness: 0.55 }), cm(1.05)));

  if (topping === 'margherita') {
    for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
      group.add(
        ring(6 + ringIndex * 4, r * (0.32 + ringIndex * 0.34), (x, z, j) => {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(cm(1.4 + j), 8, 6), mat(PALETTE.basil, { roughness: 0.8 }));
          leaf.position.set(x, cm(1.4), z);
          leaf.scale.set(1.3, 0.25, 0.9);
          return leaf;
        }, ringIndex + 2),
      );
      group.add(
        ring(5 + ringIndex * 3, r * (0.45 + ringIndex * 0.28), (x, z) => {
          const tomatoSlice = disc(cm(1.9), cm(1.9), cm(0.5), mat(PALETTE.tomato, { roughness: 0.5 }), cm(1.35));
          tomatoSlice.position.x = x;
          tomatoSlice.position.z = z;
          return tomatoSlice;
        }, ringIndex + 5),
      );
    }
  } else {
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      group.add(
        ring(5 + ringIndex * 4, r * (0.22 + ringIndex * 0.29), (x, z) => {
          const slice = disc(cm(2.1), cm(2.1), cm(0.45), mat(PALETTE.pepperoni, { roughness: 0.55 }), cm(1.35));
          slice.position.x = x;
          slice.position.z = z;
          return slice;
        }, ringIndex + 1),
      );
    }
  }

  return group;
}

function buildFries() {
  const group = new THREE.Group();
  const holderH = cm(9);
  const holder = new THREE.Mesh(
    new THREE.CylinderGeometry(cm(5.2), cm(3.4), holderH, 6, 1, true),
    mat(PALETTE.paper, { roughness: 0.9 }),
  );
  holder.position.y = holderH / 2;
  group.add(holder);
  group.add(disc(cm(3.4), cm(3.4), cm(0.4), mat(PALETTE.paper), 0, 6));

  for (let i = 0; i < 26; i += 1) {
    const angle = i * 2.399;
    const radius = cm(0.6 + (i % 5) * 0.9);
    const length = cm(7 + ((i * 7) % 5));
    const fry = box(cm(0.75), length, cm(0.75), mat(PALETTE.potato, { roughness: 0.75 }));
    fry.position.set(Math.cos(angle) * radius, holderH * 0.62 + length / 2 - cm(1.5), Math.sin(angle) * radius);
    fry.rotation.z = Math.cos(angle) * 0.22;
    fry.rotation.x = Math.sin(angle) * 0.22;
    fry.rotation.y = angle;
    group.add(fry);
  }
  return group;
}

function buildOnionRings() {
  const group = new THREE.Group();
  const stacks = [
    { y: cm(0.9), r: cm(4.4), tilt: 0.0 },
    { y: cm(2.5), r: cm(4.0), tilt: 0.12 },
    { y: cm(4.1), r: cm(4.3), tilt: -0.1 },
    { y: cm(5.7), r: cm(3.8), tilt: 0.18 },
  ];
  stacks.forEach((s, i) => {
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(s.r, cm(1.3), 10, 30),
      mat(PALETTE.batter, { roughness: 0.9 }),
    );
    torus.rotation.x = Math.PI / 2 + s.tilt;
    torus.rotation.z = i * 0.5;
    torus.position.y = s.y;
    group.add(torus);
  });
  return group;
}

function buildBrownie() {
  const group = new THREE.Group();
  group.add(disc(cm(9), cm(8.6), cm(0.7), mat(PALETTE.plate, { roughness: 0.35 }), 0));
  const cake = box(cm(7), cm(3.4), cm(6), mat(PALETTE.chocolate, { roughness: 0.85 }), [cm(-1.2), cm(0.7) + cm(1.7), 0], 0.2);
  group.add(cake);
  group.add(dome(cm(2.6), 0.9, mat(PALETTE.vanilla, { roughness: 0.5 }), cm(4.1)).translateX(cm(4.2)));
  // calda escorrendo
  group.add(
    ring(5, cm(3.0), (x, z, j) => {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(cm(0.7 + j * 0.4), 8, 6), mat(PALETTE.glaze, { roughness: 0.35 }));
      drop.position.set(x - cm(1.2), cm(4.2) - j * cm(0.8), z);
      drop.scale.y = 1.4;
      return drop;
    }, 2),
  );
  return group;
}

function buildPetitGateau() {
  const group = new THREE.Group();
  group.add(disc(cm(7.5), cm(7.2), cm(0.6), mat(PALETTE.plate, { roughness: 0.35 }), 0));
  group.add(disc(cm(3.1), cm(2.7), cm(3.6), mat(PALETTE.chocolate, { roughness: 0.8 }), cm(0.6)));
  group.add(dome(cm(2.3), 0.85, mat(PALETTE.vanilla, { roughness: 0.5 }), cm(4.2)).translateX(cm(3.9)));
  group.add(
    ring(3, cm(1.0), (x, z, j) => {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(cm(0.9), 10, 8), mat(PALETTE.strawberry, { roughness: 0.6 }));
      berry.position.set(x, cm(4.4) + j * cm(0.3), z);
      return berry;
    }, 4),
  );
  return group;
}

function buildMilkshake() {
  const group = new THREE.Group();
  const glassH = cm(13);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(cm(4.2), cm(2.8), glassH, 40, 1, true),
    mat(PALETTE.glass, { roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.34 }),
  );
  glass.position.y = glassH / 2;
  group.add(glass);
  group.add(disc(cm(2.8), cm(3.4), cm(0.8), mat(PALETTE.glass, { roughness: 0.15, transparent: true, opacity: 0.6 }), 0));
  group.add(disc(cm(3.9), cm(2.9), glassH * 0.82, mat(PALETTE.strawberry, { roughness: 0.65 }), cm(0.8)));
  group.add(dome(cm(4.0), 0.85, mat(PALETTE.vanilla, { roughness: 0.55 }), glassH * 0.86));
  group.add(dome(cm(2.6), 0.8, mat(PALETTE.vanilla, { roughness: 0.55 }), glassH * 0.86 + cm(2.4)));
  const straw = new THREE.Mesh(
    new THREE.CylinderGeometry(cm(0.5), cm(0.5), cm(9), 12),
    mat('#E0483F', { roughness: 0.4 }),
  );
  straw.position.set(cm(1.4), glassH + cm(3.2), cm(0.6));
  straw.rotation.z = 0.28;
  group.add(straw);
  return group;
}

function buildSoda() {
  const group = new THREE.Group();
  const h = cm(14);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(cm(3.9), cm(3.0), h, 40, 1, true),
    mat(PALETTE.glass, { roughness: 0.1, transparent: true, opacity: 0.3 }),
  );
  glass.position.y = h / 2;
  group.add(glass);
  group.add(disc(cm(3.0), cm(3.2), cm(0.7), mat(PALETTE.glass, { roughness: 0.12, transparent: true, opacity: 0.55 }), 0));
  group.add(disc(cm(3.7), cm(3.0), h * 0.86, mat(PALETTE.cola, { roughness: 0.25, transparent: true, opacity: 0.9 }), cm(0.7)));
  for (let i = 0; i < 7; i += 1) {
    const angle = i * 1.9;
    const ice = box(cm(1.8), cm(1.8), cm(1.8), mat(PALETTE.ice, { roughness: 0.05, transparent: true, opacity: 0.55 }));
    ice.position.set(Math.cos(angle) * cm(1.5), h * (0.35 + (i % 4) * 0.16), Math.sin(angle) * cm(1.5));
    ice.rotation.set(angle, angle * 0.7, angle * 0.3);
    group.add(ice);
  }
  return group;
}

function buildRibs() {
  const group = new THREE.Group();
  const boardW = cm(24);
  const boardD = cm(17);
  group.add(box(boardW, cm(1.4), boardD, mat('#7A5230', { roughness: 0.9 }), [0, cm(0.7), 0]));
  for (let i = 0; i < 4; i += 1) {
    const rib = box(cm(17), cm(3.2), cm(2.8), mat(PALETTE.rib, { roughness: 0.75 }), [
      cm(-1) + (i % 2) * cm(1.2),
      cm(1.4) + cm(1.6),
      cm(-5.4) + i * cm(3.6),
    ], (i - 1.5) * 0.05);
    group.add(rib);
    const glazeLayer = box(cm(17.2), cm(0.5), cm(2.9), mat(PALETTE.glaze, { roughness: 0.3 }), [
      cm(-1) + (i % 2) * cm(1.2),
      cm(1.4) + cm(3.3),
      cm(-5.4) + i * cm(3.6),
    ], (i - 1.5) * 0.05);
    group.add(glazeLayer);
  }
  return group;
}

function buildCaesarSalad() {
  const group = new THREE.Group();
  const bowlR = cm(10.5);
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(bowlR, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    mat(PALETTE.bowl, { roughness: 0.4 }),
  );
  bowl.position.y = bowlR * 0.55;
  bowl.scale.y = 0.55;
  group.add(bowl);

  for (let i = 0; i < 22; i += 1) {
    const angle = i * 2.399;
    const r = cm(1.2 + (i % 5) * 1.5);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(cm(2.4), 8, 6), mat(PALETTE.greens, { roughness: 0.85 }));
    leaf.position.set(Math.cos(angle) * r, cm(4.2) + (i % 3) * cm(0.8), Math.sin(angle) * r);
    leaf.scale.set(1.1, 0.32, 0.7);
    leaf.rotation.y = angle;
    group.add(leaf);
  }
  for (let i = 0; i < 7; i += 1) {
    const angle = i * 1.6;
    group.add(box(cm(1.6), cm(1.6), cm(1.6), mat(PALETTE.crouton, { roughness: 0.9 }), [
      Math.cos(angle) * cm(4),
      cm(5.6),
      Math.sin(angle) * cm(4),
    ], angle));
  }
  group.add(
    ring(9, cm(5), (x, z) => {
      const flake = box(cm(1.4), cm(0.2), cm(1.0), mat(PALETTE.parmesan, { roughness: 0.7 }));
      flake.position.set(x, cm(6.0), z);
      flake.rotation.set(0.3, x * 20, 0.2);
      return flake;
    }, 6),
  );
  return group;
}

// ---------------------------------------------------------------------------
// Catalogo
// ---------------------------------------------------------------------------
const MODELS = [
  { file: 'smash-bacon', build: () => buildBurger({ radius: cm(5.8), layers: [{ type: 'patty' }, { type: 'cheese' }, { type: 'bacon' }, { type: 'patty' }, { type: 'cheese' }] }) },
  { file: 'burger-da-casa', build: () => buildBurger({ radius: cm(6.3), layers: [{ type: 'patty' }, { type: 'cheese' }, { type: 'lettuce' }, { type: 'tomato' }, { type: 'onion' }] }) },
  { file: 'pizza-margherita', build: () => buildPizza({ radiusCm: 15, topping: 'margherita' }) },
  { file: 'pizza-pepperoni', build: () => buildPizza({ radiusCm: 15, topping: 'pepperoni' }) },
  { file: 'batata-crocante', build: buildFries },
  { file: 'aneis-de-cebola', build: buildOnionRings },
  { file: 'brownie', build: buildBrownie },
  { file: 'petit-gateau', build: buildPetitGateau },
  { file: 'milkshake', build: buildMilkshake },
  { file: 'refrigerante', build: buildSoda },
  { file: 'costela-defumada', build: buildRibs },
  { file: 'salada-caesar', build: buildCaesarSalad },
];

async function exportModel({ file, build }) {
  const scene = new THREE.Scene();
  scene.name = file;
  const group = build();
  group.name = file;
  scene.add(group);

  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);

  const glb = Buffer.from(
    await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true }),
  );
  writeFileSync(resolve(OUT_DIR, `${file}.glb`), glb);

  // O Quick Look apoia o objeto sozinho na superficie detectada; declarar a
  // ancoragem horizontal evita que ele tente prender o prato numa parede.
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
    sizeCm: [size.x, size.y, size.z].map((v) => Math.round(v * 1000) / 10),
  };
}

/**
 * O USDZ e um zip com duas regras que o Quick Look verifica em silencio: nada
 * pode estar comprimido, e o conteudo de cada arquivo precisa comecar num
 * offset multiplo de 64 bytes. Violar qualquer uma faz o iPhone abrir uma tela
 * cinza sem mensagem — o tipo de defeito que so aparece no aparelho do cliente.
 * Por isso a conferencia roda aqui, e derruba a geracao se algo sair errado.
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
    if (inicioDoConteudo % 64 !== 0) problemas.push(`${nome} comeca em ${inicioDoConteudo}, fora do alinhamento de 64 bytes`);

    cursor = inicioDoConteudo + tamanhoComprimido;
  }

  if (cursor === 0) problemas.push('nenhuma entrada de zip encontrada');
  return problemas;
}

mkdirSync(OUT_DIR, { recursive: true });

const results = [];
for (const model of MODELS) {
  results.push(await exportModel(model));
}

const invalidos = results
  .map((r) => ({ file: r.file, problemas: validarUsdz(resolve(OUT_DIR, `${r.file}.usdz`)) }))
  .filter((r) => r.problemas.length > 0);

if (invalidos.length > 0) {
  for (const { file, problemas } of invalidos) {
    console.error(`USDZ invalido: ${file}.usdz`);
    for (const problema of problemas) console.error(`  - ${problema}`);
  }
  process.exit(1);
}

const totalGlb = results.reduce((acc, r) => acc + r.glbKb, 0);
const totalUsdz = results.reduce((acc, r) => acc + r.usdzKb, 0);
console.table(
  results.map((r) => ({
    modelo: r.file,
    'GLB (KB)': r.glbKb,
    'USDZ (KB)': r.usdzKb,
    'LxAxP (cm)': r.sizeCm.join(' x '),
  })),
);
console.log(
  `
${results.length} modelos - GLB ${totalGlb} KB, USDZ ${totalUsdz} KB - ${OUT_DIR}`,
);
console.log('USDZ conferidos: sem compressao e alinhados em 64 bytes.');
