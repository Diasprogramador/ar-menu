/**
 * Formatação e aritmética de valores.
 *
 * Dinheiro circula sempre em centavos inteiros. Nenhuma soma de preço usa
 * ponto flutuante: `0.1 + 0.2` já basta como argumento. Os totais mostrados na
 * tela são de apresentação — o valor cobrado é sempre o que a RPC `create_order`
 * calcula no banco.
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let cached = currencyFormatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(locale, { style: 'currency', currency });
    currencyFormatters.set(key, cached);
  }
  return cached;
}

export function formatMoney(cents: number, currency = 'BRL', locale = 'pt-BR'): string {
  return formatter(currency, locale).format(cents / 100);
}

/** "42,90" sem o símbolo — usado quando o R$ já aparece próximo. */
export function formatAmount(cents: number, locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    cents / 100,
  );
}

export function formatCompact(value: number, locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

/** Divisão segura para taxas de conversão: 0 abaixo evita NaN na tela. */
export function rate(part: number, total: number): number {
  if (!total || total <= 0) return 0;
  return part / total;
}

export function formatDate(iso: string, locale = 'pt-BR'): string {
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

export function formatDateTime(iso: string, locale = 'pt-BR'): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(iso: string, locale = 'pt-BR'): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}

/** "12 × 8 × 12 cm" ou "30 cm de diâmetro × 3 cm" */
export function formatDimensions(dimensions: {
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  diameter_cm: number | null;
}): string {
  const round = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

  if (dimensions.diameter_cm) {
    const parts = [`${round(dimensions.diameter_cm)} cm de diâmetro`];
    if (dimensions.height_cm) parts.push(`${round(dimensions.height_cm)} cm de altura`);
    return parts.join(' · ');
  }

  const axes = [dimensions.width_cm, dimensions.height_cm, dimensions.depth_cm].filter(
    (v): v is number => typeof v === 'number',
  );
  if (axes.length === 0) return 'Dimensões não informadas';
  return `${axes.map(round).join(' × ')} cm`;
}

const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
