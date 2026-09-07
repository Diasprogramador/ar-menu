import { describe, expect, it } from 'vitest';

import {
  applyPinch,
  calibrateScale,
  cmToMeters,
  scalePercentage,
  USER_SCALE_RANGE,
  validateDimensions,
} from './scale';

/**
 * A calibração de escala é o cálculo que sustenta a promessa central do
 * produto. Um erro aqui não quebra a tela — ele coloca um hambúrguer do tamanho
 * de uma pizza na mesa do cliente, sem que ninguém perceba no código.
 */
describe('calibrateScale', () => {
  it('mantém a escala em 1 quando o modelo já vem nas medidas reais', () => {
    // Modelo exportado em metros: 12,7 cm de largura equivale a 0,127 unidades
    const calibration = calibrateScale(
      { width_cm: 12.7, height_cm: 9.9, depth_cm: 12.2, diameter_cm: null },
      { x: 0.127, y: 0.099, z: 0.122 },
    );

    expect(calibration.baseScale).toBeCloseTo(1, 3);
    expect(calibration.warning).toBeUndefined();
  });

  it('corrige um modelo exportado em centímetros', () => {
    // O mesmo hambúrguer exportado do Blender em cm: 12,7 unidades de cena
    const calibration = calibrateScale(
      { width_cm: 12.7, height_cm: 9.9, depth_cm: 12.2, diameter_cm: null },
      { x: 12.7, y: 9.9, z: 12.2 },
    );

    expect(calibration.baseScale).toBeCloseTo(0.01, 4);
    expect(calibration.finalSizeMeters.x).toBeCloseTo(cmToMeters(12.7), 4);
  });

  it('usa o diâmetro nos dois eixos horizontais de um prato redondo', () => {
    const calibration = calibrateScale(
      { width_cm: null, height_cm: 2.1, depth_cm: null, diameter_cm: 30.4 },
      { x: 30.4, y: 2.1, z: 30.4 },
    );

    expect(calibration.drivingAxis).toBe('diameter');
    expect(calibration.finalSizeMeters.x).toBeCloseTo(0.304, 3);
    expect(calibration.finalSizeMeters.y).toBeCloseTo(0.021, 3);
  });

  it('escolhe o menor fator para o objeto caber na caixa declarada', () => {
    // Modelo desproporcional: a altura exigiria 2×, a largura só permite 1×
    const calibration = calibrateScale(
      { width_cm: 10, height_cm: 20, depth_cm: null, diameter_cm: null },
      { x: 0.1, y: 0.05, z: 0.1 },
    );

    // width -> 0.1/0.1 = 1 ; height -> 0.2/0.05 = 4 ; vence o menor
    expect(calibration.baseScale).toBeCloseTo(1, 3);
    expect(calibration.drivingAxis).toBe('width');
  });

  it('avisa quando a unidade do modelo parece errada', () => {
    const gigante = calibrateScale(
      { width_cm: 12, height_cm: 8, depth_cm: null, diameter_cm: null },
      { x: 1000, y: 800, z: 1000 },
    );
    expect(gigante.warning).toMatch(/muito maior/i);

    const minusculo = calibrateScale(
      { width_cm: 12, height_cm: 8, depth_cm: null, diameter_cm: null },
      { x: 0.001, y: 0.0008, z: 0.001 },
    );
    expect(minusculo.warning).toMatch(/muito menor/i);
  });

  it('aplica o multiplicador de ajuste fino sobre a escala calibrada', () => {
    const base = calibrateScale(
      { width_cm: 12, height_cm: 8, depth_cm: null, diameter_cm: null },
      { x: 0.12, y: 0.08, z: 0.12 },
    );
    const ajustado = calibrateScale(
      { width_cm: 12, height_cm: 8, depth_cm: null, diameter_cm: null },
      { x: 0.12, y: 0.08, z: 0.12 },
      1.5,
    );

    expect(ajustado.baseScale).toBeCloseTo(base.baseScale * 1.5, 4);
  });

  it('normaliza para 20 cm e avisa quando não há dimensão cadastrada', () => {
    const calibration = calibrateScale(
      { width_cm: null, height_cm: null, depth_cm: null, diameter_cm: null },
      { x: 2, y: 1, z: 2 },
    );

    expect(calibration.warning).toMatch(/sem dimensões/i);
    expect(Math.max(...Object.values(calibration.finalSizeMeters))).toBeCloseTo(0.2, 3);
  });

  it('não divide por zero com um modelo degenerado', () => {
    const calibration = calibrateScale(
      { width_cm: 12, height_cm: 8, depth_cm: null, diameter_cm: null },
      { x: 0, y: 0, z: 0 },
    );

    expect(Number.isFinite(calibration.baseScale)).toBe(true);
  });

  it('deriva a faixa de interação a partir da escala base', () => {
    const calibration = calibrateScale(
      { width_cm: 12, height_cm: 8, depth_cm: null, diameter_cm: null },
      { x: 0.12, y: 0.08, z: 0.12 },
    );

    expect(calibration.minScale).toBeCloseTo(calibration.baseScale * USER_SCALE_RANGE.min, 5);
    expect(calibration.maxScale).toBeCloseTo(calibration.baseScale * USER_SCALE_RANGE.max, 5);
  });
});

describe('applyPinch', () => {
  const limites = { minScale: 0.5, maxScale: 2 };

  it('respeita o teto para não destruir a noção de escala', () => {
    expect(applyPinch(1.8, 3, limites)).toBe(2);
  });

  it('respeita o piso', () => {
    expect(applyPinch(0.6, 0.1, limites)).toBe(0.5);
  });

  it('aplica o gesto dentro da faixa', () => {
    expect(applyPinch(1, 1.2, limites)).toBeCloseTo(1.2, 5);
  });
});

describe('scalePercentage', () => {
  it('mostra 100% quando o objeto está no tamanho real', () => {
    expect(scalePercentage(0.25, 0.25)).toBe(100);
  });

  it('arredonda a proporção atual', () => {
    expect(scalePercentage(0.5, 0.25)).toBe(200);
    expect(scalePercentage(0.125, 0.25)).toBe(50);
  });

  it('não quebra com escala base inválida', () => {
    expect(scalePercentage(1, 0)).toBe(100);
  });
});

describe('validateDimensions', () => {
  it('aceita um cadastro coerente', () => {
    expect(
      validateDimensions({ width_cm: 12, height_cm: 8, depth_cm: 12, diameter_cm: null }),
    ).toEqual([]);
  });

  it('exige um eixo horizontal e a altura', () => {
    const problemas = validateDimensions({
      width_cm: null,
      height_cm: null,
      depth_cm: null,
      diameter_cm: null,
    });

    expect(problemas).toHaveLength(2);
    expect(problemas.join(' ')).toMatch(/largura ou o diâmetro/i);
    expect(problemas.join(' ')).toMatch(/altura/i);
  });

  it('recusa largura e diâmetro ao mesmo tempo', () => {
    const problemas = validateDimensions({
      width_cm: 12,
      height_cm: 8,
      depth_cm: null,
      diameter_cm: 30,
    });
    expect(problemas.join(' ')).toMatch(/não os dois/i);
  });

  it('recusa um prato maior que a mesa', () => {
    const problemas = validateDimensions({
      width_cm: 400,
      height_cm: 8,
      depth_cm: null,
      diameter_cm: null,
    });
    expect(problemas.join(' ')).toMatch(/limite é 300/i);
  });

  it('recusa medida pequena demais para ser visível', () => {
    const problemas = validateDimensions({
      width_cm: 0.2,
      height_cm: 8,
      depth_cm: null,
      diameter_cm: null,
    });
    expect(problemas.join(' ')).toMatch(/pequena demais/i);
  });

  it('detecta desproporção entre altura e base', () => {
    const problemas = validateDimensions({
      width_cm: 5,
      height_cm: 200,
      depth_cm: null,
      diameter_cm: null,
    });
    expect(problemas.join(' ')).toMatch(/desproporcional/i);
  });
});
