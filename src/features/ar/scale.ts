/**
 * Calibração de escala física.
 *
 * O problema real: um GLB não diz "eu sou um hambúrguer de 12 cm". Ele traz um
 * bounding box em unidades de cena, e a especificação glTF 2.0 define que uma
 * unidade equivale a um metro — mas modelos exportados de Blender, ZBrush ou
 * marketplaces frequentemente chegam em centímetros, polegadas ou numa escala
 * arbitrária. Assumir "1 unidade = 1 metro" e pronto é como o objeto acaba do
 * tamanho de um carro na mesa do cliente.
 *
 * Então mantemos quatro grandezas separadas e explícitas:
 *
 *   1. dimensões físicas reais    — cadastradas pelo restaurante, em cm
 *   2. bounding box do modelo     — medido no GLB carregado, em unidades de cena
 *   3. escala base calibrada      — a razão entre (1) e (2)
 *   4. escala escolhida pelo usuário — um multiplicador limitado em torno de (3)
 *
 * O passo (4) tem trava proposital: se o cliente pudesse aumentar sem limite, a
 * promessa "escala aproximada 1:1" deixaria de valer.
 */

export type PhysicalDimensions = {
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  diameter_cm: number | null;
};

export type BoundingBoxSize = {
  x: number;
  y: number;
  z: number;
};

export type ScaleCalibration = {
  /** Fator a aplicar no modelo para que ele meça o tamanho real, em metros. */
  baseScale: number;
  /** Menor e maior fator permitidos na interação do usuário. */
  minScale: number;
  maxScale: number;
  /** Tamanho final do objeto em metros, já com a escala base aplicada. */
  finalSizeMeters: BoundingBoxSize;
  /** Eixo que determinou a calibração, útil para depurar cadastros errados. */
  drivingAxis: 'width' | 'height' | 'depth' | 'diameter';
  /** Preenchido quando o resultado merece atenção do administrador. */
  warning?: string;
};

/** Faixa de interação: metade a duas vezes o tamanho real. */
export const USER_SCALE_RANGE = { min: 0.5, max: 2 } as const;

/** Abaixo/acima disso, o cadastro provavelmente está em unidade errada. */
const SUSPICIOUS_SCALE_LOW = 0.02;
const SUSPICIOUS_SCALE_HIGH = 50;

const EPSILON = 1e-6;

export function cmToMeters(cm: number): number {
  return cm / 100;
}

export function metersToCm(meters: number): number {
  return meters * 100;
}

/**
 * Calcula a escala que faz o modelo medir as dimensões reais do prato.
 *
 * A escala é uniforme: distorcer os eixos independentemente deformaria o
 * modelo. Escolhemos o menor fator entre os eixos informados, de modo que o
 * objeto caiba na caixa declarada em vez de estourá-la.
 */
export function calibrateScale(
  dimensions: PhysicalDimensions,
  modelSize: BoundingBoxSize,
  scaleMultiplier = 1,
): ScaleCalibration {
  const safeSize: BoundingBoxSize = {
    x: Math.max(modelSize.x, EPSILON),
    y: Math.max(modelSize.y, EPSILON),
    z: Math.max(modelSize.z, EPSILON),
  };

  const candidates: { axis: ScaleCalibration['drivingAxis']; ratio: number }[] = [];

  if (dimensions.diameter_cm && dimensions.diameter_cm > 0) {
    // Prato redondo: o diâmetro governa os dois eixos horizontais
    const horizontal = Math.max(safeSize.x, safeSize.z);
    candidates.push({ axis: 'diameter', ratio: cmToMeters(dimensions.diameter_cm) / horizontal });
  } else {
    if (dimensions.width_cm && dimensions.width_cm > 0) {
      candidates.push({ axis: 'width', ratio: cmToMeters(dimensions.width_cm) / safeSize.x });
    }
    if (dimensions.depth_cm && dimensions.depth_cm > 0) {
      candidates.push({ axis: 'depth', ratio: cmToMeters(dimensions.depth_cm) / safeSize.z });
    }
  }

  if (dimensions.height_cm && dimensions.height_cm > 0) {
    candidates.push({ axis: 'height', ratio: cmToMeters(dimensions.height_cm) / safeSize.y });
  }

  if (candidates.length === 0) {
    // Sem dimensão cadastrada não há como prometer 1:1. Normalizamos para uma
    // apresentação de 20 cm na maior aresta, e avisamos.
    const largest = Math.max(safeSize.x, safeSize.y, safeSize.z);
    const fallback = cmToMeters(20) / largest;
    return {
      baseScale: fallback * clampMultiplier(scaleMultiplier),
      minScale: fallback * USER_SCALE_RANGE.min,
      maxScale: fallback * USER_SCALE_RANGE.max,
      finalSizeMeters: scaleSize(safeSize, fallback),
      drivingAxis: 'width',
      warning: 'Produto sem dimensões cadastradas: a escala 1:1 não pode ser garantida.',
    };
  }

  const driving = candidates.reduce((smallest, current) =>
    current.ratio < smallest.ratio ? current : smallest,
  );

  const baseScale = driving.ratio * clampMultiplier(scaleMultiplier);

  let warning: string | undefined;
  if (driving.ratio < SUSPICIOUS_SCALE_LOW) {
    warning =
      'O modelo 3D é muito maior que as dimensões cadastradas. Verifique se ele foi exportado em metros.';
  } else if (driving.ratio > SUSPICIOUS_SCALE_HIGH) {
    warning =
      'O modelo 3D é muito menor que as dimensões cadastradas. Verifique a unidade usada na exportação.';
  }

  return {
    baseScale,
    minScale: baseScale * USER_SCALE_RANGE.min,
    maxScale: baseScale * USER_SCALE_RANGE.max,
    finalSizeMeters: scaleSize(safeSize, baseScale),
    drivingAxis: driving.axis,
    ...(warning ? { warning } : {}),
  };
}

function scaleSize(size: BoundingBoxSize, factor: number): BoundingBoxSize {
  return { x: size.x * factor, y: size.y * factor, z: size.z * factor };
}

function clampMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 1;
  return clamp(multiplier, 0.1, 10);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Aplica o gesto de pinça respeitando os limites da calibração. */
export function applyPinch(
  currentScale: number,
  gestureFactor: number,
  calibration: Pick<ScaleCalibration, 'minScale' | 'maxScale'>,
): number {
  return clamp(currentScale * gestureFactor, calibration.minScale, calibration.maxScale);
}

/** Quanto o tamanho atual se afasta do 1:1, em porcentagem (100 = exato). */
export function scalePercentage(currentScale: number, baseScale: number): number {
  if (baseScale <= 0) return 100;
  return Math.round((currentScale / baseScale) * 100);
}

/**
 * Valida um cadastro de dimensões antes de salvar. Impede a configuração
 * absurda chegar ao cliente — um hambúrguer de 2 metros, por exemplo.
 */
export function validateDimensions(dimensions: PhysicalDimensions): string[] {
  const problems: string[] = [];
  const { width_cm, height_cm, depth_cm, diameter_cm } = dimensions;

  if (!width_cm && !diameter_cm) {
    problems.push('Informe a largura ou o diâmetro do prato.');
  }
  if (!height_cm) {
    problems.push('Informe a altura do prato.');
  }
  if (width_cm && diameter_cm) {
    problems.push('Use largura/profundidade para pratos retangulares ou diâmetro para redondos, não os dois.');
  }

  const entries: [string, number | null][] = [
    ['Largura', width_cm],
    ['Altura', height_cm],
    ['Profundidade', depth_cm],
    ['Diâmetro', diameter_cm],
  ];

  for (const [label, value] of entries) {
    if (value === null) continue;
    if (!Number.isFinite(value) || value <= 0) {
      problems.push(`${label} precisa ser um número maior que zero.`);
    } else if (value < 0.5) {
      problems.push(`${label} de ${value} cm é pequena demais para ser visível em AR.`);
    } else if (value > 300) {
      problems.push(`${label} de ${value} cm não cabe em uma mesa. O limite é 300 cm.`);
    }
  }

  const horizontal = diameter_cm ?? width_cm;
  if (horizontal && height_cm && height_cm > horizontal * 12) {
    problems.push('A altura é desproporcional à base. Confira as medidas.');
  }

  return problems;
}
