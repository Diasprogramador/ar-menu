import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase, toDataError } from '@/lib/supabase';
import type { MembershipRole, Profile, Restaurant } from '@/types/database';

/**
 * Sessão do restaurante no painel administrativo.
 *
 * Guarda três coisas distintas: a sessão do Supabase Auth, o perfil da pessoa e
 * o vínculo dela com um restaurante. O papel (`role`) vem de
 * `restaurant_memberships`, nunca de e-mail ou de estado do frontend — as
 * mesmas políticas de RLS que o servidor aplica dependem dessa tabela.
 *
 * O que se decide aqui é apenas o que a interface mostra. Permissão de verdade
 * é decidida no banco.
 */

export type AuthMembership = {
  restaurant: Restaurant;
  role: MembershipRole;
};

type AuthContextValue = {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  profile: Profile | null;
  memberships: AuthMembership[];
  activeRestaurant: Restaurant | null;
  role: MembershipRole | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: { email: string; password: string; fullName: string }) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, 'full_name' | 'phone'>>) => Promise<void>;
  switchRestaurant: (restaurantId: string) => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVE_RESTAURANT_KEY = 'ar-menu:active-restaurant';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<AuthMembership[]>([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_RESTAURANT_KEY);
    } catch {
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  const loadContext = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setMemberships([]);
      return;
    }

    const [profileResult, membershipsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
      supabase
        .from('restaurant_memberships')
        .select('role, restaurants (*)')
        .eq('user_id', currentUser.id),
    ]);

    setProfile((profileResult.data as Profile | null) ?? null);

    const rows = (membershipsResult.data ?? []) as { role: MembershipRole; restaurants: Restaurant | Restaurant[] | null }[];
    const list: AuthMembership[] = rows
      .map((row) => {
        const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
        return restaurant ? { restaurant, role: row.role } : null;
      })
      .filter((value): value is AuthMembership => value !== null);

    setMemberships(list);
  }, []);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadContext(data.session?.user ?? null);
      if (active) setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      // O refresh de token dispara com frequência e não muda perfil nem vínculo
      if (event === 'TOKEN_REFRESHED') return;
      void loadContext(nextSession?.user ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadContext]);

  const activeMembership = useMemo(() => {
    if (memberships.length === 0) return null;
    return (
      memberships.find((item) => item.restaurant.id === activeRestaurantId) ?? memberships[0] ?? null
    );
  }, [memberships, activeRestaurantId]);

  const switchRestaurant = useCallback((restaurantId: string) => {
    setActiveRestaurantId(restaurantId);
    try {
      localStorage.setItem(ACTIVE_RESTAURANT_KEY, restaurantId);
    } catch {
      /* armazenamento indisponível: a troca vale só nesta sessão */
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: !ready ? 'loading' : session ? 'authenticated' : 'anonymous',
      user: session?.user ?? null,
      profile,
      memberships,
      activeRestaurant: activeMembership?.restaurant ?? null,
      role: activeMembership?.role ?? null,

      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          throw new Error(
            error.message === 'Invalid login credentials'
              ? 'E-mail ou senha incorretos.'
              : 'Não foi possível entrar. Tente de novo em instantes.',
          );
        }
      },

      signUp: async ({ email, password, fullName }) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/admin/entrar`,
          },
        });
        if (error) {
          throw new Error(
            error.message.includes('already registered')
              ? 'Já existe uma conta com este e-mail.'
              : 'Não foi possível criar a conta. Verifique os dados e tente de novo.',
          );
        }
        // Sem sessão imediata significa que o projeto exige confirmação por e-mail
        return { needsConfirmation: !data.session };
      },

      signOut: async () => {
        await supabase.auth.signOut();
        setMemberships([]);
        setProfile(null);
      },

      requestPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/admin/nova-senha`,
        });
        if (error) throw new Error('Não foi possível enviar o e-mail de recuperação.');
      },

      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error('Não foi possível atualizar a senha.');
      },

      updateProfile: async (patch) => {
        if (!session?.user) throw new Error('Sessão expirada.');
        const { error } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
        if (error) throw toDataError(error, 'Não foi possível salvar o perfil.');
        setProfile((current) => (current ? { ...current, ...patch } : current));
      },

      switchRestaurant,
      refresh: () => loadContext(session?.user ?? null),
    }),
    [ready, session, profile, memberships, activeMembership, switchRestaurant, loadContext],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return context;
}

/** Capacidades por papel. Espelha o que as políticas de RLS permitem. */
export const ROLE_CAPABILITIES: Record<MembershipRole, Set<string>> = {
  owner: new Set([
    'manage_catalog',
    'manage_orders',
    'manage_tables',
    'manage_qrcodes',
    'view_analytics',
    'manage_settings',
    'manage_team',
    'manage_billing',
  ]),
  admin: new Set([
    'manage_catalog',
    'manage_orders',
    'manage_tables',
    'manage_qrcodes',
    'view_analytics',
    'manage_settings',
  ]),
  staff: new Set(['manage_orders']),
};

export function useCan(capability: string): boolean {
  const { role } = useAuth();
  if (!role) return false;
  return ROLE_CAPABILITIES[role].has(capability);
}
