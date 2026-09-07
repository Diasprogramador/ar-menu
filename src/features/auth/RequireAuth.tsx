import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './AuthProvider';
import { RouteFallback } from '@/components/RouteFallback';

/**
 * Proteção das rotas administrativas.
 *
 * Isto é usabilidade, não segurança: redirecionar quem não está logado evita
 * uma tela quebrada. Quem contornar o roteador continua barrado pelas políticas
 * de RLS, que é onde a autorização de verdade acontece.
 */
export function RequireAuth({
  children,
  allowWithoutRestaurant = false,
}: {
  children: ReactNode;
  allowWithoutRestaurant?: boolean;
}) {
  const { status, memberships } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <RouteFallback />;

  if (status === 'anonymous') {
    return <Navigate to="/admin/entrar" replace state={{ from: location.pathname }} />;
  }

  // Conta recém-criada ainda sem restaurante: manda para o onboarding
  if (!allowWithoutRestaurant && memberships.length === 0) {
    return <Navigate to="/admin/primeiro-acesso" replace />;
  }

  return <>{children}</>;
}
