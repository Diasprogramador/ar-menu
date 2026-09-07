import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

/**
 * Casca do painel.
 *
 * Aqui a decisão de design é a oposta da do cardápio: nada de identidade forte.
 * Um painel que a pessoa usa oito horas por dia precisa ser previsível — barra
 * lateral à esquerda, rótulos explícitos, acento petróleo em vez do laranja da
 * marca, que cansaria em uso contínuo.
 */

type NavItem = { to: string; label: string; icon: string; end?: boolean; capability?: string };

const NAV: NavItem[] = [
  { to: '/admin', label: 'Visão geral', icon: 'M3 10.5L10 4l7 6.5V17H3z', end: true },
  { to: '/admin/pedidos', label: 'Pedidos', icon: 'M4 4h12v12H4zM7 8h6M7 11h4' },
  { to: '/admin/produtos', label: 'Produtos', icon: 'M4 6h12v10H4zM4 6l2-2h8l2 2' },
  { to: '/admin/categorias', label: 'Categorias', icon: 'M4 5h12M4 10h12M4 15h7' },
  { to: '/admin/mesas', label: 'Mesas', icon: 'M3 7h14M6 7v9M14 7v9M10 4v3' },
  { to: '/admin/qrcodes', label: 'QR Codes', icon: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM12 12h3v3h-3' },
  { to: '/admin/analytics', label: 'Métricas', icon: 'M4 16V9M9 16V4M14 16v-5' },
  { to: '/admin/configuracoes', label: 'Configurações', icon: 'M10 6.5A3.5 3.5 0 1010 13.5 3.5 3.5 0 0010 6.5' },
];

export default function AdminLayout() {
  const { activeRestaurant, memberships, switchRestaurant, profile, signOut, role } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleNav = NAV.filter((item) => {
    // Staff só cuida de pedidos; esconder o resto evita cliques em telas
    // que o banco recusaria de qualquer forma.
    if (role !== 'staff') return true;
    return item.to === '/admin/pedidos' || item.end === true;
  });

  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[240px_1fr]">
      {/* Barra lateral (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-paper lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="h-px w-5 ember-rule" aria-hidden />
          <span className="font-display text-[17px]">AR Menu</span>
        </div>

        <nav className="flex-1 px-3">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'mb-0.5 flex items-center gap-2.5 rounded-[6px] px-3 py-2 text-[14px] transition-colors',
                  isActive ? 'bg-teal-soft font-medium text-teal' : 'text-muted hover:bg-surface hover:text-ink',
                )
              }
            >
              <svg viewBox="0 0 20 20" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {activeRestaurant && (
          <Link
            to={`/r/${activeRestaurant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="mx-3 mb-3 flex items-center gap-2 rounded-[6px] border border-hairline px-3 py-2 text-[13px] text-muted hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 4H5v11h11v-3M12 4h4v4M16 4l-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Ver cardápio público
          </Link>
        )}
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Topo */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-hairline bg-paper px-4 py-3">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            className="flex size-9 items-center justify-center rounded-[6px] border border-hairline lg:hidden"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 6h12M4 10h12M4 14h12" strokeLinecap="round" />
            </svg>
          </button>

          {memberships.length > 1 ? (
            <select
              value={activeRestaurant?.id ?? ''}
              onChange={(event) => switchRestaurant(event.target.value)}
              aria-label="Restaurante ativo"
              className="h-9 rounded-[6px] border border-hairline bg-paper px-2 text-[14px] font-medium"
            >
              {memberships.map((membership) => (
                <option key={membership.restaurant.id} value={membership.restaurant.id}>
                  {membership.restaurant.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="truncate text-[15px] font-medium">{activeRestaurant?.name}</p>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[13px] text-muted sm:inline">{roleLabel(role)}</span>
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-full bg-teal-soft text-[13px] font-semibold text-teal"
            >
              {initials(profile?.full_name ?? 'AR')}
            </span>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/admin/entrar', { replace: true });
              }}
              className="h-9 rounded-[6px] px-2.5 text-[14px] text-muted hover:bg-surface hover:text-ink"
            >
              Sair
            </button>
          </div>
        </header>

        {/* Navegação móvel */}
        {menuOpen && (
          <nav className="border-b border-hairline bg-paper px-3 py-2 lg:hidden">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'block rounded-[6px] px-3 py-2.5 text-[15px]',
                    isActive ? 'bg-teal-soft font-medium text-teal' : 'text-muted',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function roleLabel(role: string | null): string {
  if (role === 'owner') return 'Proprietário';
  if (role === 'admin') return 'Administrador';
  if (role === 'staff') return 'Equipe';
  return '';
}
