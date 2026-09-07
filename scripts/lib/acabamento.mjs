/**
 * Paleta e acabamentos dos pratos — a camada que decide se a comida parece
 * comida ou parece massinha de modelar.
 *
 * A versão anterior tentava fotorrealismo: ruído coerente deslocando todos os
 * vértices, textura procedural em cada peça, normal map forte por toda parte.
 * O resultado caiu no vale da estranheza — a silhueta ficava mole, a superfície
 * granulada, e tudo com a mesma resposta fosca à luz. Comida de verdade é o
 * oposto disso: aresta definida onde foi cortada, cor saturada, e **brilhos
 * muito diferentes entre um pão e uma fatia de queijo derretido**.
 *
 * A direção agora é ilustrada, não simulada: forma limpa, cor cheia e contraste
 * de brilho. Duas consequências práticas:
 *
 *   1. Nenhum material carrega textura. O que diferencia o pão do queijo é
 *      `roughness` e `clearcoat`, não um mapa de ruído. Isso também derrubou o
 *      tamanho dos arquivos, porque normal map não deduplica entre materiais.
 *   2. A variação de forma vem de `ondular` — seno de baixa frequência em torno
 *      do eixo —, que quebra o círculo perfeito sem esfarelar a silhueta, ao
 *      contrário do deslocamento por ruído.
 *
 * O `clearcoat` é a peça central: é uma segunda camada especular por cima do
 * material, que é exatamente o que a gordura da carne, o brilho do queijo
 * derretido e a água do tomate fazem na vida real. Ele depende de ter o que
 * refletir, então os visualizadores precisam de mapa de ambiente — sem isso o
 * brilho não aparece e o prato volta a parecer fosco.
 */
import * as THREE from 'three';

/**
 * Cores de fotografia de comida: quentes e saturadas.
 *
 * A paleta anterior era dessaturada — `#59331F` para hambúrguer, `#C98A45`
 * para pão. Sob tone mapping ACES, que já comprime a saturação, isso chegava
 * na tela como marrom de barro.
 */
export const PALETA = {
  // Hambúrguer
  paoTopo: '#C9873A',
  paoBase: '#B87830',
  paoMiolo: '#EFDCB4',
  gergelim: '#F0DCB4',
  carne: '#7A4E32',
  carneCrosta: '#33180C',
  queijo: '#EE9613',
  bacon: '#A73220',
  alface: '#6BA836',
  tomate: '#CC3325',
  cebola: '#E9DCCC',

  // Pizza
  massa: '#DDB264',
  borda: '#CE9642',
  molho: '#AE2E1B',
  mucarela: '#F2E6C8',
  manjericao: '#377B2E',
  pepperoni: '#9C241D',

  // Fritos
  batata: '#DFA53A',
  papel: '#EAE2D3',
  empanado: '#C07C2E',

  // Sobremesas
  chocolate: '#3B1E15',
  baunilha: '#F2E7D0',
  morango: '#E06786',
  calda: '#4F1B0D',
  louca: '#EDE8DF',

  // Bebidas
  vidro: '#D5E4EA',
  refri: '#33180C',
  gelo: '#E4F1F6',
  cereja: '#B81E2D',
  canudo: '#D3423B',

  // Pratos principais
  costela: '#642D1B',
  madeira: '#7E5430',

  // Salada
  folha: '#569A31',
  parmesao: '#EBD69C',
  crouton: '#D3AC68',
  tigela: '#333A3D',
};

/**
 * Acabamentos nomeados.
 *
 * Cada linha é uma resposta à luz, não uma cor. É o que faz o olho distinguir
 * queijo derretido de purê de batata mesmo quando os dois são amarelos.
 */
export const ACABAMENTOS = {
  /** Casca de pão rústico: fosca, sem reflexo. */
  pao: { roughness: 0.86 },
  /**
   * Pão de hambúrguer. Brioche leva pincelada de ovo antes de assar, e sai do
   * forno com brilho — modelá-lo fosco era metade do motivo de o hambúrguer
   * parecer moldado em massa em vez de assado.
   */
  brioche: { roughness: 0.44, clearcoat: 0.4, clearcoatRoughness: 0.34 },
  /** Miolo cortado: ainda mais fosco, porque é poroso. */
  miolo: { roughness: 0.93 },
  /** Carne na chapa: gordura na superfície devolve um brilho largo e difuso. */
  grelhado: { roughness: 0.46, clearcoat: 0.5, clearcoatRoughness: 0.42 },
  /** Queijo derretido: brilho fechado e bem definido. */
  derretido: { roughness: 0.24, clearcoat: 0.75, clearcoatRoughness: 0.2 },
  /** Tomate, molho, glace: superfície molhada, o brilho mais fechado de todos. */
  molhado: { roughness: 0.15, clearcoat: 0.9, clearcoatRoughness: 0.1 },
  /** Folha: cerosa, brilho suave e espalhado. */
  folha: { roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.5 },
  /** Empanado e crocante: fosco, mas menos que pão — a fritura deixa um véu. */
  crocante: { roughness: 0.7 },
  /** Louça esmaltada. */
  ceramica: { roughness: 0.14, clearcoat: 0.65, clearcoatRoughness: 0.08 },
  madeira: { roughness: 0.72 },
  /** Sorvete e chantilly: sem reflexo especular, porque espalham a luz. */
  cremoso: { roughness: 0.6 },
  papel: { roughness: 0.95 },
  /** Sementes e grãos pequenos. */
  semente: { roughness: 0.55 },
};

/**
 * Material a partir de uma cor e de um acabamento nomeado.
 *
 * Usa `MeshPhysicalMaterial` só quando há `clearcoat`: o material físico é mais
 * caro de avaliar e exporta uma extensão a mais no glTF, então não vale a pena
 * pagar por ele num pão.
 *
 * A cor por vértice fica sempre ligada, e é sempre um **multiplicador** em
 * torno de 1,0 — nunca a cor final. Assim, se algum visualizador descartar
 * `COLOR_0`, o prato fica liso mas continua da cor certa, em vez de branco.
 */
export function material(cor, nomeDoAcabamento, extras = {}) {
  const receita = ACABAMENTOS[nomeDoAcabamento];
  if (!receita) {
    throw new Error(`acabamento: "${nomeDoAcabamento}" não existe na tabela.`);
  }

  const comum = {
    color: new THREE.Color(cor),
    metalness: 0,
    vertexColors: true,
    ...receita,
    ...extras,
  };

  if (comum.transparent && comum.side === undefined) comum.side = THREE.DoubleSide;

  return comum.clearcoat
    ? new THREE.MeshPhysicalMaterial(comum)
    : new THREE.MeshStandardMaterial(comum);
}

/**
 * Quebra o círculo perfeito de uma geometria de revolução.
 *
 * Multiplica o raio de cada vértice por um seno de baixa frequência do ângulo.
 * Diferente do deslocamento por ruído, isto muda a silhueta **sem** perder a
 * aresta: um pão fica levemente irregular, como pão assado à mão, em vez de
 * amassado como massinha.
 *
 * `amplitude` é relativa: 0,02 é uma variação de 2% no raio.
 */
export function ondular(geometry, { ondas = 5, amplitude = 0.02, fase = 0 } = {}) {
  const posicoes = geometry.attributes.position;

  for (let i = 0; i < posicoes.count; i += 1) {
    const x = posicoes.getX(i);
    const z = posicoes.getZ(i);
    const raio = Math.hypot(x, z);
    if (raio < 1e-5) continue;

    const fator = 1 + Math.sin(Math.atan2(z, x) * ondas + fase) * amplitude;
    posicoes.setX(i, x * fator);
    posicoes.setZ(i, z * fator);
  }

  posicoes.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
