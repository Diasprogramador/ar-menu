import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { MenuLayout } from '@/features/menu/MenuLayout';
import { ToastHost } from '@/components/ToastHost';
import { ConfigurationNotice } from '@/components/ConfigurationNotice';
import { RouteFallback } from '@/components/RouteFallback';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { env } from '@/lib/env';

/**
 * Roteamento.
 *
 * O corte por `lazy` segue o público de cada rota: quem abre o cardápio pelo QR
 * Code nunca baixa o bundle do painel administrativo, e o painel não carrega o
 * three.js. O visualizador 3D é dividido mais uma vez dentro da própria página
 * de produto, para só chegar ao aparelho quando o cliente pede AR.
 */

const LandingPage = lazy(() => import('@/features/landing/LandingPage'));
const MenuHomePage = lazy(() => import('@/features/menu/pages/MenuHomePage'));
const CategoryPage = lazy(() => import('@/features/menu/pages/CategoryPage'));
const ProductPage = lazy(() => import('@/features/menu/pages/ProductPage'));
const CartPage = lazy(() => import('@/features/cart/CartPage'));
const OrderReceiptPage = lazy(() => import('@/features/orders/OrderReceiptPage'));
const NotFoundPage = lazy(() => import('@/components/NotFoundPage'));

const SignInPage = lazy(() => import('@/features/auth/pages/SignInPage'));
const SignUpPage = lazy(() => import('@/features/auth/pages/SignUpPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));

const AdminLayout = lazy(() => import('@/features/admin/AdminLayout'));
const DashboardPage = lazy(() => import('@/features/admin/pages/DashboardPage'));
const ProductsPage = lazy(() => import('@/features/admin/pages/ProductsPage'));
const ProductEditorPage = lazy(() => import('@/features/admin/pages/ProductEditorPage'));
const CategoriesPage = lazy(() => import('@/features/admin/pages/CategoriesPage'));
const TablesPage = lazy(() => import('@/features/admin/pages/TablesPage'));
const QrCodesPage = lazy(() => import('@/features/admin/pages/QrCodesPage'));
const AdminOrdersPage = lazy(() => import('@/features/admin/pages/AdminOrdersPage'));
const AnalyticsPage = lazy(() => import('@/features/admin/pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('@/features/admin/pages/SettingsPage'));
const OnboardingPage = lazy(() => import('@/features/admin/pages/OnboardingPage'));

/**
 * O painel administrativo depende de banco de verdade: autenticação, escrita e
 * métricas não têm equivalente em catálogo estático. Sem as chaves do Supabase,
 * mostramos o que fazer em vez de deixar cada consulta estourar um erro
 * diferente. O cardápio público não passa por aqui — ele tem modo demonstração.
 */
function RequireConfig({ children }: { children: React.ReactNode }) {
  if (!env.isConfigured) return <ConfigurationNotice />;
  return <>{children}</>;
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* A página comercial não consulta o banco: continua no ar mesmo
                  antes de alguém configurar o Supabase. */}
              <Route path="/" element={<LandingPage />} />

              {/* Cardápio público. O layout resolve o restaurante uma única vez
                  e compartilha com as telas filhas. Sem as chaves do Supabase,
                  ele serve o catálogo de demonstração em vez de uma tela de erro. */}
              <Route path="/r/:slug" element={<MenuLayout />}>
                <Route index element={<MenuHomePage />} />
                <Route path="mesa/:tableCode" element={<MenuHomePage />} />
                <Route path="categoria/:categorySlug" element={<CategoryPage />} />
                <Route path="produto/:productSlug" element={<ProductPage />} />
                <Route path="carrinho" element={<CartPage />} />
                <Route path="pedido/:code" element={<OrderReceiptPage />} />
              </Route>

              <Route path="/admin/entrar" element={<RequireConfig><SignInPage /></RequireConfig>} />
              <Route path="/admin/cadastro" element={<RequireConfig><SignUpPage /></RequireConfig>} />
              <Route path="/admin/recuperar" element={<RequireConfig><ForgotPasswordPage /></RequireConfig>} />
              <Route path="/admin/nova-senha" element={<RequireConfig><ResetPasswordPage /></RequireConfig>} />

              <Route
                path="/admin"
                element={
                  <RequireConfig>
                    <RequireAuth>
                      <AdminLayout />
                    </RequireAuth>
                  </RequireConfig>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="produtos" element={<ProductsPage />} />
                <Route path="produtos/novo" element={<ProductEditorPage />} />
                <Route path="produtos/:productId" element={<ProductEditorPage />} />
                <Route path="categorias" element={<CategoriesPage />} />
                <Route path="mesas" element={<TablesPage />} />
                <Route path="qrcodes" element={<QrCodesPage />} />
                <Route path="pedidos" element={<AdminOrdersPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="configuracoes" element={<SettingsPage />} />
              </Route>

              <Route
                path="/admin/primeiro-acesso"
                element={
                  <RequireConfig>
                    <RequireAuth allowWithoutRestaurant>
                      <OnboardingPage />
                    </RequireAuth>
                  </RequireConfig>
                }
              />

              <Route path="/cardapio" element={<Navigate to="/r/brasa-e-mesa" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <ToastHost />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
