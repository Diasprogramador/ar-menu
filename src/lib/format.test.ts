import { describe, expect, it } from 'vitest';

import { formatDimensions, formatMoney, formatPercent, rate, slugify } from './format';

describe('formatMoney', () => {
  it('formata centavos em real brasileiro', () => {
    // O separador do Intl é um espaço não separável, não um espaço comum
    expect(formatMoney(4290).replace(/ /g, ' ')).toBe('R$ 42,90');
    expect(formatMoney(0).replace(/ /g, ' ')).toBe('R$ 0,00');
  });

  it('mantém duas casas em valores redondos', () => {
    expect(formatMoney(1000)).toContain('10,00');
  });
});

describe('rate e formatPercent', () => {
  it('não divide por zero', () => {
    expect(rate(10, 0)).toBe(0);
    expect(formatPercent(rate(10, 0))).toContain('0');
  });

  it('calcula a proporção', () => {
    expect(rate(40, 100)).toBe(0.4);
    expect(formatPercent(0.4)).toContain('40');
  });
});

describe('slugify', () => {
  it('remove acentos e normaliza espaços', () => {
    expect(slugify('Pizza Margherita')).toBe('pizza-margherita');
    expect(slugify('Açaí na Tigela')).toBe('acai-na-tigela');
    expect(slugify('Coração de Frango')).toBe('coracao-de-frango');
  });

  it('remove pontuação e hífens sobrando nas pontas', () => {
    expect(slugify('  --Brasa & Mesa!!  ')).toBe('brasa-mesa');
  });

  it('limita o tamanho', () => {
    expect(slugify('a'.repeat(120)).length).toBe(60);
  });
});

describe('formatDimensions', () => {
  it('descreve prato retangular pelos três eixos', () => {
    expect(
      formatDimensions({ width_cm: 12, height_cm: 8, depth_cm: 12, diameter_cm: null }),
    ).toBe('12 × 8 × 12 cm');
  });

  it('descreve prato redondo pelo diâmetro', () => {
    expect(
      formatDimensions({ width_cm: null, height_cm: 3, depth_cm: null, diameter_cm: 30 }),
    ).toBe('30 cm de diâmetro · 3 cm de altura');
  });

  it('usa vírgula decimal', () => {
    expect(
      formatDimensions({ width_cm: 12.7, height_cm: 9.9, depth_cm: null, diameter_cm: null }),
    ).toBe('12,7 × 9,9 cm');
  });

  it('avisa quando não há medida cadastrada', () => {
    expect(
      formatDimensions({ width_cm: null, height_cm: null, depth_cm: null, diameter_cm: null }),
    ).toMatch(/não informadas/i);
  });
});
