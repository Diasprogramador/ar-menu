/**
 * Junta classes condicionais. Sem `tailwind-merge`: as classes deste projeto
 * são escritas em um único lugar por componente, então o custo de resolver
 * conflitos em runtime não se justifica.
 */
export type ClassValue = string | number | null | undefined | false | ClassValue[];

export function cn(...values: ClassValue[]): string {
  const output: string[] = [];

  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) output.push(nested);
    } else {
      output.push(String(value));
    }
  }

  return output.join(' ');
}
