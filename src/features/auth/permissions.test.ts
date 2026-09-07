import { describe, expect, it } from 'vitest';

import { ROLE_CAPABILITIES } from './AuthProvider';

/**
 * Estes testes cobrem apenas o que a interface mostra a cada papel.
 *
 * A autorização real é decidida pelas políticas de RLS em
 * `supabase/migrations/20260101000100_rls_policies.sql`. O mapa aqui precisa
 * espelhar aquelas políticas: se divergir, a pessoa vê um botão que o banco vai
 * recusar — e a mensagem de erro fica sem sentido para ela.
 */
describe('capacidades por papel', () => {
  it('owner pode tudo, inclusive equipe e cobrança', () => {
    expect(ROLE_CAPABILITIES.owner.has('manage_team')).toBe(true);
    expect(ROLE_CAPABILITIES.owner.has('manage_billing')).toBe(true);
    expect(ROLE_CAPABILITIES.owner.has('manage_catalog')).toBe(true);
  });

  it('admin gerencia o restaurante, mas não a equipe nem a cobrança', () => {
    expect(ROLE_CAPABILITIES.admin.has('manage_catalog')).toBe(true);
    expect(ROLE_CAPABILITIES.admin.has('view_analytics')).toBe(true);
    expect(ROLE_CAPABILITIES.admin.has('manage_team')).toBe(false);
    expect(ROLE_CAPABILITIES.admin.has('manage_billing')).toBe(false);
  });

  it('staff só cuida de pedidos', () => {
    expect(ROLE_CAPABILITIES.staff.has('manage_orders')).toBe(true);
    expect(ROLE_CAPABILITIES.staff.has('manage_catalog')).toBe(false);
    expect(ROLE_CAPABILITIES.staff.has('view_analytics')).toBe(false);
    expect(ROLE_CAPABILITIES.staff.has('manage_settings')).toBe(false);
  });

  it('nenhum papel recebe capacidade desconhecida por engano', () => {
    for (const capabilities of Object.values(ROLE_CAPABILITIES)) {
      expect(capabilities.has('drop_database')).toBe(false);
    }
  });
});
