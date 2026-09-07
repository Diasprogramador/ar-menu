/**
 * Os doze pratos do "Brasa & Mesa", modelados em código.
 *
 * Cada prato é construído nas dimensões reais que o cardápio anuncia, com
 * origem no centro da base — o modelo apoia em y = 0, que é o que faz o
 * posicionamento na superfície detectada funcionar sem cálculo extra.
 *
 * A regra que orienta o desenho mudou. A primeira versão perseguia
 * fotorrealismo: ruído deslocando cada vértice, textura procedural em tudo,
 * relevo forte por toda parte. Isso produziu silhueta mole e superfície
 * granulada — comida com cara de massinha de modelar. O caminho procedural não
 * alcança pele de tomate nem miolo de pão; tentar e errar sai pior do que não
 * tentar.
 *
 * A direção agora é **ilustrada**: forma limpa, cor cheia, brilho contrastado.
 * Três regras concretas:
 *
 *   1. **Silhueta antes de superfície.** O que identifica um hambúrguer a três
 *      metros de distância é a pilha de camadas com bordas visíveis, não o poro
 *      do pão. Perfis girados e arestas preservadas; nada de ruído amassando o
 *      contorno.
 *   2. **Cada comida com o seu brilho.** Pão fosco, carne com sebo, queijo
 *      envernizado, tomate molhado. É o contraste de `roughness`/`clearcoat`
 *      que faz o olho separar os ingredientes — sem ele, tudo vira o mesmo
 *      material colorido de formas diferentes.
 *   3. **Sinal de identidade é geometria ou cor chapada, nunca ruído.** Marca
 *      de chapa na carne, gergelim no pão, alface saindo para fora do pão,
 *      miolo claro no tomate: tudo desenhado de propósito, com transição
 *      nítida.
 *
 * Ruído sobrou em dois lugares onde a irregularidade *é* a identidade da
 * comida: a farinha de rosca do anel de cebola e a casca rachada do brownie.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { PALETA as C, material, ondular } from './acabamento.mjs';
import {
  cm,
  deformar,
  disco,
  duasFaces,
  fbm,
  girar,
  granular,
  peca,
  pintar,
  sorteio,
} from './modelagem.mjs';

const TAU = Math.PI * 2;

/* =========================================================================
 * Hambúrguer
 * ====================================================================== */

/**
 * Perfil da cúpula do pão, como função do raio normalizado.
 *
 * Fica numa constante porque duas coisas precisam concordar: a geometria do
 * pão e a altura em que cada gergelim assenta. Quando eram fórmulas separadas,
 * as sementes flutuavam alguns milímetros acima da casca.
 */
const EXPOENTE_DOMO = 0.42;
const raioDoDomo = (t) => Math.pow(Math.max(0, 1 - t * t), EXPOENTE_DOMO);
const alturaDoDomo = (u) => Math.sqrt(Math.max(0, 1 - Math.pow(u, 1 / EXPOENTE_DOMO)));

/** Tampa do pão: cúpula com um ressalto definido na base, como brioche. */
function paoSuperior(raio, altura) {
  const perfil = [];
  const passos = 18;
  for (let i = 0; i <= passos; i += 1) {
    const t = i / passos;
    perfil.push([raio * raioDoDomo(t), t * altura]);
  }

  const g = girar(perfil, 64);
  ondular(g, { ondas: 7, amplitude: 0.014 });
  pintar(g, (x, y) => {
    // A coroa pega mais forno que a saia: clareia de baixo para cima, com
    // transição suave. Nada de manchas — mancha aleatória lê como sujeira.
    const alto = y / altura;
    const dourado = 1.02 - alto * 0.06;
    return [dourado, dourado * 0.985, dourado * 0.95];
  });
  return g;
}

/** Base do pão: lateral reta e face de corte clara, onde se vê o miolo. */
function paoInferior(raio, altura) {
  const g = girar(
    [
      [raio * 0.84, 0],
      [raio * 0.96, altura * 0.24],
      [raio, altura * 0.6],
      [raio, altura * 0.92],
      [raio * 0.97, altura],
      [0, altura],
    ],
    64,
  );
  ondular(g, { ondas: 7, amplitude: 0.012, fase: 1.1 });
  pintar(g, (x, y) => {
    // Degrau nítido: acima disso é miolo cortado, abaixo é casca. A transição
    // dura faz o pão parecer fatiado, e não moldado.
    const miolo = y > altura * 0.9;
    return miolo ? [1.3, 1.28, 1.18] : [1, 0.99, 0.96];
  });
  return g;
}

/**
 * Hambúrguer: disco fino de borda rendada, prensado na chapa.
 *
 * A borda é o ponto. Um smash é jogado na chapa e amassado: a carne espalha,
 * a franja que escapa fritura antes do resto e vira uma renda escura e
 * irregular. É esse contorno — não o poro da carne — que faz alguém reconhecer
 * a foto de um smash. A primeira versão tinha borda lisa e ruído por cima, e
 * saía um disco de chocolate.
 *
 * A irregularidade vem de três senos sobrepostos, e não de ruído: senos dão um
 * contorno recortado e contínuo, com o mesmo resultado em toda execução. Ruído
 * na mesma amplitude come a aresta e devolve a aparência de massinha.
 */
function hamburguer(raio, altura) {
  const g = girar(
    [
      [raio * 0.94, 0],
      [raio, altura * 0.2],
      [raio * 0.99, altura * 0.5],
      [raio * 0.95, altura * 0.82],
      [raio * 0.85, altura],
      [0, altura],
    ],
    72,
  );

  // Três harmônicos: o grosso da deformação, o recorte médio e a franja fina
  ondular(g, { ondas: 7, amplitude: 0.035, fase: 0.6 });
  ondular(g, { ondas: 17, amplitude: 0.022, fase: 1.9 });
  ondular(g, { ondas: 31, amplitude: 0.011, fase: 4.1 });

  pintar(g, (x, y, z) => {
    const distancia = Math.hypot(x, z) / raio;

    // Crosta: escura e curta, colada na borda. Um degradê longo lia como
    // sujeira; a transição de 12% do raio lê como carne selada.
    const crosta = distancia > 0.88 ? Math.min(1, (distancia - 0.88) / 0.12) : 0;

    // Faixa caramelizada logo antes da crosta, onde a carne dourou sem queimar
    const caramelo = distancia > 0.72 && distancia < 0.9 ? 0.16 : 0;

    const tom = 1 + caramelo - crosta * 0.62;
    return [tom, tom * 0.93, tom * 0.86];
  });
  return g;
}

/** Fatia de queijo derretido: quadrado que amolece e escorre nas pontas. */
function queijoDerretido(raio, grupo, y) {
  const lado = raio * 1.5;
  const g = new THREE.PlaneGeometry(lado, lado, 18, 18);
  g.rotateX(-Math.PI / 2);

  const posicoes = g.attributes.position;
  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    const z = posicoes.getZ(i);
    // A fatia acompanha a carne até a borda dela e despenca depois. A queda é
    // uma curva suave, não ruído: queijo derretido escorre liso.
    const fora = Math.max(Math.abs(x), Math.abs(z)) / (lado / 2);
    const queda = fora > 0.6 ? -Math.pow((fora - 0.6) / 0.4, 1.8) * cm(2.4) : 0;
    // Leve barriga no meio, onde o queijo afunda sobre a carne
    const barriga = -Math.cos((Math.min(fora, 0.6) / 0.6) * Math.PI * 0.5) * cm(0.12);
    posicoes.setY(i, queda + barriga);
  }
  posicoes.needsUpdate = true;
  g.computeVertexNormals();
  granular(g, 0.07, 40);

  grupo.add(peca(duasFaces(g), material(C.queijo, 'derretido'), { y }));
}

/** Tira de bacon: ondulada, com faixas de gordura de borda nítida. */
function tiraDeBacon(comprimento, largura, semente) {
  const g = new THREE.PlaneGeometry(comprimento, largura, 26, 3);
  g.rotateX(-Math.PI / 2);

  const posicoes = g.attributes.position;
  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    posicoes.setY(i, Math.sin(x * 44 + semente) * cm(0.26));
  }
  posicoes.needsUpdate = true;
  g.computeVertexNormals();

  pintar(g, (x, y, z) => {
    // Duas faixas de gordura ao longo da tira, com corte seco entre elas
    const atravessado = z / (largura / 2);
    const gordura = Math.abs(atravessado) > 0.55 || Math.abs(atravessado + 0.15) < 0.12;
    return gordura ? [1.62, 1.34, 1.16] : [1, 0.92, 0.86];
  });
  return duasFaces(g);
}

/**
 * Coroa de alface: anel ondulado que passa do raio do pão.
 *
 * Sair para fora é o ponto. A folha escondida sob o pão não aparece em
 * silhueta, e era exatamente por isso que o hambúrguer lia como uma pilha de
 * discos marrons.
 */
function coroaDeAlface(raioInterno, raioExterno, semente) {
  const g = new THREE.RingGeometry(raioInterno, raioExterno, 44, 3);
  g.rotateX(-Math.PI / 2);

  const posicoes = g.attributes.position;
  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    const z = posicoes.getZ(i);
    const distancia = Math.hypot(x, z);
    const t = (distancia - raioInterno) / (raioExterno - raioInterno);
    const angulo = Math.atan2(z, x);
    // Rufo: onda angular que só existe na borda livre da folha
    posicoes.setY(i, Math.sin(angulo * 9 + semente) * t * t * cm(0.85) - t * cm(0.2));
  }
  posicoes.needsUpdate = true;
  g.computeVertexNormals();

  pintar(g, (x, y, z) => {
    const distancia = Math.hypot(x, z);
    const t = (distancia - raioInterno) / (raioExterno - raioInterno);
    // Base da folha bem mais clara que a borda — é assim na alface americana
    const claro = 1.28 - t * 0.42;
    return [claro * 0.9, claro, claro * 0.78];
  });
  return duasFaces(g);
}

/** Rodela de tomate: disco molhado com miolo claro de contorno definido. */
function rodelaDeTomate(raio, altura) {
  const g = disco(raio, altura, { segmentos: 40 });
  ondular(g, { ondas: 6, amplitude: 0.02 });
  pintar(g, (x, y, z) => {
    const distancia = Math.hypot(x, z) / raio;
    // Miolo claro com transição curta: a polpa tem contorno, não degradê
    const miolo = distancia < 0.5 ? 1.45 : distancia < 0.58 ? 1.2 : 1;
    return [miolo, miolo * 0.74, miolo * 0.7];
  });
  return g;
}

export function construirHamburguer({ raio, camadas }) {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(4242);
  let y = 0;

  const alturaBase = cm(1.8);
  grupo.add(peca(paoInferior(raio * 0.97, alturaBase), material(C.paoBase, 'brioche'), { y }));
  y += alturaBase;

  for (const camada of camadas) {
    switch (camada) {
      case 'carne': {
        const altura = cm(1.6);
        grupo.add(peca(hamburguer(raio, altura), material(C.carne, 'grelhado'), { y }));
        y += altura * 0.94;
        break;
      }
      case 'queijo':
        queijoDerretido(raio, grupo, y + cm(0.12));
        y += cm(0.4);
        break;
      case 'bacon': {
        for (let i = 0; i < 3; i += 1) {
          const g = tiraDeBacon(raio * 1.95, cm(2.2), i * 2.3);
          grupo.add(
            peca(g, material(C.bacon, 'grelhado'), {
              y: y + cm(0.34),
              z: (i - 1) * cm(2),
              rotacao: [0, (aleatorio() - 0.5) * 0.34, 0],
            }),
          );
        }
        y += cm(0.75);
        break;
      }
      case 'alface': {
        for (let i = 0; i < 2; i += 1) {
          grupo.add(
            peca(
              coroaDeAlface(raio * 0.5, raio * (1.16 - i * 0.06), i * 2.4),
              material(C.alface, 'folha'),
              { y: y + cm(0.3) + i * cm(0.3), rotacao: [0, i * 0.9, 0] },
            ),
          );
        }
        y += cm(0.95);
        break;
      }
      case 'tomate': {
        const altura = cm(0.7);
        grupo.add(peca(rodelaDeTomate(raio * 0.9, altura), material(C.tomate, 'molhado'), { y }));
        y += altura;
        break;
      }
      case 'cebola': {
        const g = new THREE.TorusGeometry(raio * 0.68, cm(0.34), 12, 44);
        g.rotateX(Math.PI / 2);
        granular(g, 0.1, 55);
        grupo.add(peca(g, material(C.cebola, 'molhado'), { y: y + cm(0.36) }));
        y += cm(0.72);
        break;
      }
      default:
        break;
    }
  }

  // Cúpula mais baixa que a versão anterior: `raio * 0.78` deixava o pão com
  // cara de bola e empurrava a altura total muito acima da que o cardápio
  // anuncia. Brioche real fica perto de metade do raio.
  const alturaTopo = raio * 0.58;
  grupo.add(peca(paoSuperior(raio, alturaTopo), material(C.paoTopo, 'brioche'), { y }));

  const gergelim = new THREE.SphereGeometry(cm(0.19), 8, 6);
  gergelim.scale(1.45, 0.6, 1);
  const matGergelim = material(C.gergelim, 'semente');

  for (let i = 0; i < 26; i += 1) {
    // Espiral de Vogel: distribui sem aglomerar e sem sortear posição
    const angulo = i * 2.399;
    const u = Math.sqrt(aleatorio()) * 0.86;
    grupo.add(
      peca(gergelim, matGergelim, {
        x: Math.cos(angulo) * raio * u,
        z: Math.sin(angulo) * raio * u,
        y: y + alturaTopo * alturaDoDomo(u) - cm(0.05),
        rotacao: [0, angulo, 0],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Pizza
 * ====================================================================== */

export function construirPizza({ raioCm, cobertura }) {
  const grupo = new THREE.Group();
  const raio = cm(raioCm);
  const aleatorio = sorteio(90210);

  const massa = disco(raio, cm(0.75), { segmentos: 72 });
  ondular(massa, { ondas: 11, amplitude: 0.008 });
  granular(massa, 0.08, 40);
  grupo.add(peca(massa, material(C.massa, 'pao')));

  // Borda: toro com manchas de leopardo desenhadas como pontos discretos, e
  // não como gradiente de ruído. O ponto separado lê como bolha queimada; o
  // gradiente lia como encardido.
  const borda = new THREE.TorusGeometry(raio * 0.92, cm(1.35), 16, 80);
  borda.rotateX(Math.PI / 2);
  ondular(borda, { ondas: 13, amplitude: 0.01 });
  pintar(borda, (x, y, z) => {
    const angulo = Math.atan2(z, x);
    // Pontos de queima espaçados de forma irregular mas determinística
    const pulso = Math.sin(angulo * 17) * Math.sin(angulo * 6.3 + 1.7);
    const queimado = pulso > 0.55 && y > -cm(0.2) ? 0.5 : 1;
    const topo = y > 0 ? 1 + y * 2.2 : 1;
    return queimado * topo;
  });
  grupo.add(peca(borda, material(C.borda, 'pao'), { y: cm(1.05) }));

  const molho = disco(raio * 0.9, cm(0.24), { segmentos: 60 });
  granular(molho, 0.1, 50);
  grupo.add(peca(molho, material(C.molho, 'molhado'), { y: cm(0.72) }));

  if (cobertura === 'margherita') {
    // Bolotas de búfala achatadas pelo forno, espalhadas sobre o molho. Poças
    // separadas lêem muito melhor que um lençol de queijo cobrindo tudo.
    const bolota = girar(
      [
        [cm(1.9), 0],
        [cm(2.0), cm(0.28)],
        [cm(1.82), cm(0.66)],
        [cm(1.1), cm(0.86)],
        [0, cm(0.9)],
      ],
      24,
    );
    ondular(bolota, { ondas: 5, amplitude: 0.05 });
    granular(bolota, 0.09, 60);
    const matBolota = material(C.mucarela, 'derretido');
    for (let i = 0; i < 8; i += 1) {
      const angulo = i * 2.399 + 0.4;
      const r = raio * (0.16 + (i % 3) * 0.26);
      grupo.add(peca(bolota, matBolota, { x: Math.cos(angulo) * r, z: Math.sin(angulo) * r, y: cm(0.94) }));
    }

    const folha = folhaDeManjericao();
    const matFolha = material(C.manjericao, 'folha');
    for (let i = 0; i < 9; i += 1) {
      const angulo = aleatorio() * TAU;
      const r = raio * (0.18 + aleatorio() * 0.56);
      grupo.add(
        peca(folha, matFolha, {
          x: Math.cos(angulo) * r,
          z: Math.sin(angulo) * r,
          y: cm(1.5),
          rotacao: [0, aleatorio() * TAU, 0],
        }),
      );
    }
  } else {
    // Muçarela gratinada em lençol, porque a pepperoni fica por cima dela
    const queijo = new THREE.CircleGeometry(raio * 0.885, 60);
    queijo.rotateX(-Math.PI / 2);
    const pos = queijo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, fbm(x * 40, 0, z * 40, 2) * cm(0.2));
    }
    pos.needsUpdate = true;
    queijo.computeVertexNormals();
    granular(queijo, 0.14, 34);
    grupo.add(peca(queijo, material(C.mucarela, 'derretido'), { y: cm(0.92) }));

    // A fatia encolhe no forno e vira uma tigelinha com a borda mais escura
    const fatia = girar(
      [
        [cm(2.05), 0],
        [cm(2.15), cm(0.2)],
        [cm(2.0), cm(0.46)],
        [cm(1.5), cm(0.36)],
        [0, cm(0.32)],
      ],
      28,
    );
    ondular(fatia, { ondas: 7, amplitude: 0.03 });
    pintar(fatia, (x, y, z) => {
      const distancia = Math.hypot(x, z) / cm(2.1);
      return distancia > 0.84 ? 0.62 : 1;
    });
    const matFatia = material(C.pepperoni, 'grelhado');

    for (let anel = 0; anel < 3; anel += 1) {
      const quantidade = 5 + anel * 4;
      for (let i = 0; i < quantidade; i += 1) {
        const angulo = (i / quantidade) * TAU + anel * 0.7;
        const r = raio * (0.2 + anel * 0.29);
        grupo.add(peca(fatia, matFatia, { x: Math.cos(angulo) * r, z: Math.sin(angulo) * r, y: cm(1.1) }));
      }
    }
  }

  return grupo;
}

/** Folha de manjericão: contorno de amêndoa, dobrada na nervura central. */
function folhaDeManjericao() {
  const g = new THREE.PlaneGeometry(cm(4.6), cm(2.8), 10, 4);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i) / cm(2.3);
    const z = p.getZ(i);
    // Estreita nas duas pontas e dobra em V ao longo do comprimento
    p.setZ(i, z * (1 - x * x) * 1.08);
    p.setY(i, Math.abs(p.getZ(i)) * 0.24 + (1 - x * x) * cm(0.08));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  pintar(g, (x, y, z) => (Math.abs(z) < cm(0.14) ? [1.3, 1.34, 1.2] : [1, 1, 1]));
  return duasFaces(g);
}

/* =========================================================================
 * Batata frita
 * ====================================================================== */

export function construirBatata() {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(777);

  const cone = girar(
    [
      [cm(3.3), 0],
      [cm(3.6), cm(1.2)],
      [cm(4.6), cm(5.5)],
      [cm(5.3), cm(8.8)],
      [cm(5.35), cm(9.1)],
    ],
    7,
  );
  granular(cone, 0.1, 30);
  grupo.add(peca(duasFaces(cone), material(C.papel, 'papel')));

  const fundo = disco(cm(3.3), cm(0.35), { segmentos: 7 });
  granular(fundo, 0.08, 30);
  grupo.add(peca(fundo, material(C.papel, 'papel')));

  const matBatata = material(C.batata, 'crocante');

  for (let i = 0; i < 24; i += 1) {
    const comprimento = cm(6.5 + aleatorio() * 3.5);
    const lado = cm(0.72 + aleatorio() * 0.22);

    // Aresta viva com um chanfro pequeno: batata palito é cortada, não moldada
    const g = new RoundedBoxGeometry(lado, comprimento, lado, 1, lado * 0.16);
    pintar(g, (x, y) => {
      // As pontas tostam mais que o meio, com transição curta
      const ponta = Math.abs(y) / (comprimento / 2);
      const tostado = ponta > 0.72 ? 1 - (ponta - 0.72) / 0.28 * 0.4 : 1;
      return [tostado, tostado * 0.95, tostado * 0.8];
    });

    const angulo = i * 2.399;
    const raio = cm(0.5 + (i % 6) * 0.62);
    grupo.add(
      peca(g, matBatata, {
        x: Math.cos(angulo) * raio,
        z: Math.sin(angulo) * raio,
        y: cm(6.4) + comprimento / 2 - cm(1.6),
        rotacao: [(aleatorio() - 0.5) * 0.3, angulo, (aleatorio() - 0.5) * 0.3],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Anéis de cebola
 * ====================================================================== */

export function construirAneis() {
  const grupo = new THREE.Group();
  const matEmpanado = material(C.empanado, 'crocante');

  const pilha = [
    { y: cm(1.15), raio: cm(4.4), inclinacao: 0.05, semente: 1 },
    { y: cm(2.85), raio: cm(4.0), inclinacao: 0.16, semente: 2 },
    { y: cm(4.55), raio: cm(4.3), inclinacao: -0.12, semente: 3 },
    { y: cm(6.25), raio: cm(3.8), inclinacao: 0.2, semente: 4 },
  ];

  for (const [indice, anel] of pilha.entries()) {
    const g = new THREE.TorusGeometry(anel.raio, cm(1.15), 14, 40);
    g.rotateX(Math.PI / 2);
    // Aqui o ruído fica: a farinha de rosca é irregular por definição, e é
    // justamente o grosseiro da superfície que diz "empanado" ao olho.
    deformar(g, { amplitude: cm(0.15), frequencia: 34, oitavas: 4, semente: anel.semente * 13 });
    // Faixa larga de propósito: farinha de rosca frita tem pedaço quase
    // branco ao lado de pedaço quase queimado. Variação estreita devolvia um
    // anel de cor única, com cara de rosquinha crua.
    pintar(g, (x, y, z) => 0.74 + fbm(x * 100, y * 100, z * 100, 3) * 0.62);

    grupo.add(
      peca(g, matEmpanado, {
        y: anel.y,
        rotacao: [anel.inclinacao, indice * 0.6, anel.inclinacao * 0.6],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Sobremesas
 * ====================================================================== */

function pratoDeLouca(raio) {
  const g = girar(
    [
      [raio * 0.42, 0],
      [raio * 0.5, cm(0.12)],
      [raio * 0.86, cm(0.42)],
      [raio, cm(0.95)],
      [raio, cm(1.05)],
      [raio * 0.94, cm(0.9)],
      [raio * 0.8, cm(0.5)],
      [0, cm(0.42)],
    ],
    56,
  );
  granular(g, 0.03, 30);
  return g;
}

/** Bola de sorvete: superfície de colher, sem reflexo especular. */
function bolaDeSorvete(raio, cor, semente) {
  const g = new THREE.SphereGeometry(raio, 28, 20);
  g.scale(1, 0.92, 1);
  ondular(g, { ondas: 6, amplitude: 0.05, fase: semente });
  granular(g, 0.09, 55);
  return peca(g, material(cor, 'cremoso'), { y: raio * 0.86 });
}

export function construirBrownie() {
  const grupo = new THREE.Group();
  grupo.add(peca(pratoDeLouca(cm(9)), material(C.louca, 'ceramica')));

  const bolo = new RoundedBoxGeometry(cm(7), cm(3.6), cm(6.2), 4, cm(0.3));
  // Ruído mantido: a casca de brownie racha, e a rachadura é o sinal de que
  // assou. Só na cor, para não arredondar as arestas do corte.
  pintar(bolo, (x, y, z) => {
    const topo = y > cm(1.3);
    if (!topo) return 0.95;
    const fissura = fbm(x * 45, 0, z * 45, 2);
    return fissura > 0.52 ? 1.55 : 1.15;
  });
  grupo.add(peca(bolo, material(C.chocolate, 'pao'), { x: cm(-1.4), y: cm(2.25) }));

  const sorvete = bolaDeSorvete(cm(2.5), C.baunilha, 12);
  sorvete.position.set(cm(4.2), cm(2.6), cm(0.4));
  grupo.add(sorvete);

  // Calda escorrendo pela lateral, envernizada
  const matCalda = material(C.calda, 'molhado');
  const aleatorio = sorteio(31);
  for (let i = 0; i < 7; i += 1) {
    const comprimento = cm(1.2 + aleatorio() * 2.4);
    const g = new THREE.CapsuleGeometry(cm(0.36), comprimento, 4, 12);
    grupo.add(
      peca(g, matCalda, {
        x: cm(-4.6) + i * cm(1.1),
        z: cm(-2.6) + aleatorio() * cm(5),
        y: cm(3.6) - comprimento / 2,
      }),
    );
  }

  return grupo;
}

export function construirPetitGateau() {
  const grupo = new THREE.Group();
  grupo.add(peca(pratoDeLouca(cm(7.5)), material(C.louca, 'ceramica')));

  const bolo = girar(
    [
      [cm(2.7), 0],
      [cm(2.85), cm(0.6)],
      [cm(3.05), cm(2.6)],
      [cm(3.1), cm(3.4)],
      [cm(2.9), cm(3.6)],
      [0, cm(3.5)],
    ],
    40,
  );
  ondular(bolo, { ondas: 8, amplitude: 0.012 });
  pintar(bolo, (x, y) => (y > cm(3.2) ? 1.3 : 1));
  grupo.add(peca(bolo, material(C.chocolate, 'pao'), { y: cm(0.42) }));

  const sorvete = bolaDeSorvete(cm(2.2), C.baunilha, 88);
  sorvete.position.set(cm(4.0), cm(2.2), 0);
  grupo.add(sorvete);

  const matFruta = material(C.morango, 'molhado');
  const aleatorio = sorteio(5150);
  for (let i = 0; i < 4; i += 1) {
    const g = new THREE.SphereGeometry(cm(0.85), 16, 12);
    g.scale(1, 1.15, 1);
    granular(g, 0.08, 70);
    const angulo = i * 1.9;
    grupo.add(
      peca(g, matFruta, {
        x: Math.cos(angulo) * cm(1.4) - cm(0.4),
        z: Math.sin(angulo) * cm(1.4),
        y: cm(4.3) + aleatorio() * cm(0.3),
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Bebidas
 * ====================================================================== */

function copo(perfilExterno, espessura = cm(0.22)) {
  const interno = perfilExterno.map(([r, y]) => [Math.max(r - espessura, 0.0005), y]);
  const g = girar([...perfilExterno, ...interno.reverse()], 56);
  granular(g, 0.02, 20);
  return g;
}

/**
 * Vidro.
 *
 * Fica como material próprio, e não na tabela de acabamentos, porque depende de
 * transparência — e transparência tem regra de ordenação e de face que os
 * outros acabamentos não têm.
 */
function vidro(opacidade) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(C.vidro),
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: opacidade,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
}

export function construirMilkshake() {
  const grupo = new THREE.Group();
  const altura = cm(13.5);

  const perfil = [
    [cm(2.9), 0],
    [cm(3.0), cm(0.5)],
    [cm(3.3), cm(2.2)],
    [cm(3.9), cm(7)],
    [cm(4.2), altura],
  ];

  const matVidro = vidro(0.3);
  grupo.add(peca(copo(perfil), matVidro));

  const base = disco(cm(2.9), cm(0.9), { segmentos: 56 });
  granular(base, 0.03, 25);
  grupo.add(peca(base, matVidro));

  const bebida = girar(
    [
      [cm(2.7), cm(0.9)],
      [cm(3.1), cm(2.4)],
      [cm(3.72), cm(7)],
      [cm(3.98), altura * 0.9],
      [0, altura * 0.9],
    ],
    52,
  );
  granular(bebida, 0.06, 40);
  grupo.add(peca(bebida, material(C.morango, 'cremoso')));

  // Chantilly em espiral: a forma que sai do bico do saco de confeitar
  const caminho = [];
  const passos = 120;
  for (let i = 0; i <= passos; i += 1) {
    const t = i / passos;
    const angulo = t * TAU * 3.2;
    const raio = cm(3.3) * (1 - t * 0.86);
    caminho.push(new THREE.Vector3(Math.cos(angulo) * raio, altura * 0.9 + t * cm(4.6), Math.sin(angulo) * raio));
  }
  const espiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(caminho), 140, cm(0.98), 14, false);
  granular(espiral, 0.07, 60);
  grupo.add(peca(espiral, material(C.baunilha, 'cremoso')));

  const cereja = new THREE.SphereGeometry(cm(0.95), 18, 14);
  grupo.add(peca(cereja, material(C.cereja, 'molhado'), { y: altura * 0.9 + cm(5.4) }));

  const canudo = new THREE.CylinderGeometry(cm(0.42), cm(0.42), cm(9.5), 16);
  grupo.add(
    peca(canudo, material(C.canudo, 'ceramica'), {
      x: cm(1.5),
      y: altura + cm(2.4),
      z: cm(0.7),
      rotacao: [0, 0, 0.3],
    }),
  );

  return grupo;
}

export function construirRefrigerante() {
  const grupo = new THREE.Group();
  const altura = cm(14);

  const perfil = [
    [cm(2.85), 0],
    [cm(2.95), cm(0.6)],
    [cm(3.4), cm(4)],
    [cm(3.85), altura],
  ];

  const matVidro = vidro(0.26);
  grupo.add(peca(copo(perfil, cm(0.2)), matVidro));

  const base = disco(cm(2.85), cm(0.7), { segmentos: 56 });
  granular(base, 0.03, 25);
  grupo.add(peca(base, matVidro));

  const liquido = girar(
    [
      [cm(2.68), cm(0.7)],
      [cm(3.24), cm(4)],
      [cm(3.66), altura * 0.86],
      [0, altura * 0.86],
    ],
    52,
  );
  granular(liquido, 0.05, 40);
  grupo.add(
    peca(
      liquido,
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(C.refri),
        roughness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0.94,
        vertexColors: true,
      }),
    ),
  );

  const matGelo = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(C.gelo),
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.55,
    vertexColors: true,
  });
  const aleatorio = sorteio(2024);
  for (let i = 0; i < 6; i += 1) {
    const lado = cm(1.7 + aleatorio() * 0.4);
    const g = new RoundedBoxGeometry(lado, lado, lado, 1, lado * 0.16);
    granular(g, 0.05, 50);
    const angulo = i * 1.9;
    grupo.add(
      peca(g, matGelo, {
        x: Math.cos(angulo) * cm(1.4),
        z: Math.sin(angulo) * cm(1.4),
        y: cm(4) + (i % 4) * cm(2.2),
        rotacao: [angulo, angulo * 0.7, angulo * 0.4],
      }),
    );
  }

  return grupo;
}

/* =========================================================================
 * Pratos principais
 * ====================================================================== */

export function construirCostela() {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(1212);

  const tabua = new RoundedBoxGeometry(cm(24), cm(1.6), cm(17), 3, cm(0.25));
  pintar(tabua, (x, y, z) => {
    // Veio da madeira: listras finas e paralelas, desenhadas e não sorteadas
    const veio = Math.sin(z * 90 + Math.sin(x * 14) * 1.6) * 0.5 + 0.5;
    return 0.9 + veio * 0.2;
  });
  grupo.add(peca(tabua, material(C.madeira, 'madeira'), { y: cm(0.8) }));

  for (let i = 0; i < 4; i += 1) {
    // Costela: perfil girado e depois esticado ao longo de X, que é o
    // comprimento da peça. As quatro ficam lado a lado em Z, sobre a tábua.
    const comprimento = cm(16.5);
    const g = girar(
      [
        [cm(1.55), 0],
        [cm(1.72), cm(0.9)],
        [cm(1.66), cm(2.3)],
        [cm(1.3), cm(3.1)],
        [0, cm(3.25)],
      ],
      20,
    );
    g.rotateZ(Math.PI / 2);
    g.scale(comprimento / cm(3.4), 1, 1);
    // O perfil girado nasce apoiado numa das pontas; centralizar evita que a
    // costela ultrapasse a tábua de um lado só.
    g.computeBoundingBox();
    g.translate(-(g.boundingBox.min.x + g.boundingBox.max.x) / 2, 0, 0);

    pintar(g, (x) => {
      // Anéis de glace ao longo do osso, com pontos carbonizados regulares
      const faixa = Math.sin(x * 42) * 0.5 + 0.5;
      const carbonizado = faixa > 0.78 ? 0.6 : 1;
      return carbonizado * (0.94 + faixa * 0.18);
    });

    grupo.add(
      peca(g, material(C.costela, 'molhado'), {
        y: cm(1.6) + cm(1.7),
        z: cm(-5.4) + i * cm(3.6),
        x: (aleatorio() - 0.5) * cm(1.4),
        rotacao: [0, (aleatorio() - 0.5) * 0.06, 0],
      }),
    );
  }

  return grupo;
}

export function construirSalada() {
  const grupo = new THREE.Group();
  const aleatorio = sorteio(606);

  const tigela = girar(
    [
      [cm(4.2), 0],
      [cm(4.6), cm(0.4)],
      [cm(7.6), cm(2.6)],
      [cm(10.2), cm(5.6)],
      [cm(10.5), cm(6)],
      [cm(10.1), cm(5.7)],
      [cm(7.3), cm(2.8)],
      [cm(4.1), cm(0.5)],
    ],
    56,
  );
  granular(tigela, 0.04, 25);
  grupo.add(peca(duasFaces(tigela), material(C.tigela, 'ceramica')));

  // Folhas de romana: compridas, dobradas ao meio, com nervura clara
  const matFolha = material(C.folha, 'folha');
  for (let i = 0; i < 14; i += 1) {
    const comprimento = cm(5 + aleatorio() * 3.5);
    const largura = cm(2.2 + aleatorio() * 1.4);
    const g = new THREE.PlaneGeometry(comprimento, largura, 10, 4);
    g.rotateX(-Math.PI / 2);

    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      const x = pos.getX(v) / (comprimento / 2);
      const z = pos.getZ(v) / (largura / 2);
      pos.setZ(v, pos.getZ(v) * (1 - x * x * 0.55));
      // Dobra em V ao longo da nervura + ondulação na borda
      pos.setY(v, Math.abs(z) * largura * 0.36 + Math.sin(x * 5 + i) * cm(0.24));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    pintar(g, (x, y, z) => (Math.abs(z) < cm(0.24) ? [1.34, 1.42, 1.2] : [1, 1, 1]));

    const angulo = i * 2.399;
    const raio = cm(1 + (i % 5) * 1.5);
    grupo.add(
      peca(duasFaces(g), matFolha, {
        x: Math.cos(angulo) * raio,
        z: Math.sin(angulo) * raio,
        y: cm(3.4) + (i % 4) * cm(0.75),
        rotacao: [(aleatorio() - 0.5) * 0.5, angulo, (aleatorio() - 0.5) * 0.5],
      }),
    );
  }

  const matCrouton = material(C.crouton, 'crocante');
  for (let i = 0; i < 8; i += 1) {
    const lado = cm(1.4 + aleatorio() * 0.5);
    const g = new RoundedBoxGeometry(lado, lado, lado, 1, lado * 0.1);
    // Ruído mantido: crouton é pão rasgado, o irregular é o que o identifica
    deformar(g, { amplitude: cm(0.055), frequencia: 40, semente: i * 9 });
    pintar(g, (x, y, z) => 0.88 + fbm(x * 80, y * 80, z * 80, 2) * 0.32);
    const angulo = i * 1.7;
    grupo.add(
      peca(g, matCrouton, {
        x: Math.cos(angulo) * cm(3.6),
        z: Math.sin(angulo) * cm(3.6),
        y: cm(5.4) + aleatorio() * cm(0.6),
        rotacao: [angulo, angulo * 0.6, angulo * 0.3],
      }),
    );
  }

  // Lascas de parmesão: finas e curvadas, não plaquinhas retas
  const matParmesao = material(C.parmesao, 'crocante');
  for (let i = 0; i < 9; i += 1) {
    const g = new THREE.PlaneGeometry(cm(1.9), cm(1.2), 6, 3);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v += 1) {
      const x = pos.getX(v) / cm(0.95);
      pos.setY(v, x * x * cm(0.18));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    granular(g, 0.07, 80);

    const angulo = i * 2.1;
    grupo.add(
      peca(duasFaces(g), matParmesao, {
        x: Math.cos(angulo) * cm(4.4),
        z: Math.sin(angulo) * cm(4.4),
        y: cm(5.9),
        rotacao: [(aleatorio() - 0.5) * 0.6, angulo, (aleatorio() - 0.5) * 0.6],
      }),
    );
  }

  return grupo;
}
