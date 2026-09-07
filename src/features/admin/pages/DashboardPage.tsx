import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { getMetrics } from '../adminService';
import { PageHeader, PanelSection } from '../components/AdminPrimitives';
import { useAuth } from '@/features/auth/AuthProvider';
import { ErrorState, Panel, Skeleton, StatTile } from '@/components/ui';
import { formatMoney, formatPercent, rate } from '@/lib/format';
import { useResource } from '@/lib/useResource';
import { useSeo } from '@/lib/seo';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
] as const;

/**
 * Visão geral do restaurante.
 *
 * Os gráficos aqui respondem a duas perguntas concretas: "quanto entrou?" e
 * "a realidade aumentada faz alguém pedir?". Nada de gráfico decorativo — o
 * funil de AR é o número que justifica o plano Pro, então é ele que ganha
 * espaço próprio.
 */
export default function DashboardPage() {
  const { activeRestaurant } = useAuth();
  const [days, setDays] = useState<number>(30);

  useSeo({ title: 'Visão geral — AR Menu', noIndex: true });

  const metrics = useResource(
    () => getMetrics(activeRestaurant!.id, days),
    [activeRestaurant?.id, days],
  );

  const dailySeries = useMemo(
    () =>
      (metrics.data?.daily ?? []).map((point) => ({
        dia: new Date(point.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        receita: point.revenue_cents / 100,
        pedidos: point.orders,
      })),
    [metrics.data],
  );

  if (!activeRestaurant) return null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Visão geral"
        description={`Desempenho de ${activeRestaurant.name} nos últimos ${days} dias.`}
        actions={
          <div className="flex rounded-[6px] border border-hairline p-0.5">
            {PERIODS.map((period) => (
              <button
                key={period.days}
                type="button"
                onClick={() => setDays(period.days)}
                aria-pressed={days === period.days}
                className={
                  days === period.days
                    ? 'rounded-[4px] bg-teal px-3 py-1.5 text-[13px] font-medium text-white'
                    : 'rounded-[4px] px-3 py-1.5 text-[13px] text-muted hover:text-ink'
                }
              >
                {period.label}
              </button>
            ))}
          </div>
        }
      />

      {metrics.status === 'loading' && !metrics.data && <DashboardSkeleton />}

      {metrics.status === 'error' && !metrics.data && (
        <ErrorState message={metrics.error} onRetry={metrics.reload} />
      )}

      {metrics.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Faturamento"
              value={formatMoney(metrics.data.revenue_cents, activeRestaurant.currency)}
              detail={`${metrics.data.order_count} ${metrics.data.order_count === 1 ? 'pedido' : 'pedidos'}`}
              tone="teal"
            />
            <StatTile
              label="Ticket médio"
              value={formatMoney(metrics.data.avg_ticket_cents, activeRestaurant.currency)}
            />
            <StatTile
              label="Visualizações em AR"
              value={metrics.data.ar_opens.toLocaleString('pt-BR')}
              detail={`${metrics.data.ar_placements.toLocaleString('pt-BR')} posicionaram na mesa`}
              tone="ember"
            />
            <StatTile
              label="Conversão do cardápio"
              value={formatPercent(rate(metrics.data.orders_created, metrics.data.product_views))}
              detail="pedidos por prato visto"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <PanelSection title="Receita por dia">
              {dailySeries.length === 0 ? (
                <EmptyChart message="Nenhum pedido no período." />
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={dailySeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0F4C5C" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#0F4C5C" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#E4E0DA" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 11, fill: '#97918A' }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#97918A' }}
                      tickLine={false}
                      axisLine={false}
                      width={54}
                      tickFormatter={(value: number) => `R$ ${value.toFixed(0)}`}
                    />
                    <Tooltip
                      formatter={(value) => [
                        formatMoney(Math.round(Number(value) * 100), activeRestaurant.currency),
                        'Receita',
                      ]}
                      contentStyle={tooltipStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="receita"
                      stroke="#0F4C5C"
                      strokeWidth={2}
                      fill="url(#revenue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </PanelSection>

            <ARFunnel metrics={metrics.data} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <PanelSection
              title="Mais vendidos"
              action={
                <Link to="/admin/produtos" className="text-[13px] text-muted underline underline-offset-2">
                  Produtos
                </Link>
              }
            >
              {metrics.data.top_selling.length === 0 ? (
                <EmptyChart message="Sem vendas no período." />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, metrics.data.top_selling.length * 34)}>
                  <BarChart
                    data={metrics.data.top_selling}
                    layout="vertical"
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#E4E0DA" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#97918A' }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="product_name"
                      width={130}
                      tick={{ fontSize: 12, fill: '#2B2521' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#F6F4F1' }}
                      formatter={(value) => [`${Number(value)} un.`, 'Vendidos']}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="units" fill="#0F4C5C" radius={[0, 3, 3, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </PanelSection>

            <PanelSection title="Mais visualizados">
              {metrics.data.top_viewed.length === 0 ? (
                <EmptyChart message="Sem visualizações no período." />
              ) : (
                <ul className="divide-y divide-hairline">
                  {metrics.data.top_viewed.map((item) => (
                    <li key={item.product_id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[14px]">{item.product_name}</span>
                      <span className="tabular text-[13px] text-muted">{item.views} visitas</span>
                      {item.ar_opens > 0 && (
                        <span className="tabular rounded-[4px] bg-ember-wash px-1.5 py-0.5 text-[12px] font-medium text-ember-deep">
                          {item.ar_opens} AR
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </PanelSection>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatTile label="Produtos ativos" value={String(metrics.data.active_products)} />
            <StatTile label="Categorias" value={String(metrics.data.active_categories)} />
            <StatTile label="Pratos com AR" value={String(metrics.data.ar_products)} tone="ember" />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Funil da experiência de AR.
 *
 * Barras proporcionais em vez de gráfico: com cinco etapas e números pequenos,
 * a leitura direta é mais honesta do que um funil desenhado.
 */
function ARFunnel({ metrics }: { metrics: NonNullable<ReturnType<typeof useResource<Awaited<ReturnType<typeof getMetrics>>>>['data']> }) {
  const steps = [
    { label: 'Viram o prato', value: metrics.product_views },
    { label: 'Abriram a AR', value: metrics.ar_opens },
    { label: 'Posicionaram na mesa', value: metrics.ar_placements },
    { label: 'Adicionaram ao carrinho', value: metrics.cart_adds },
    { label: 'Fecharam o pedido', value: metrics.orders_created },
  ];
  const top = Math.max(...steps.map((step) => step.value), 1);

  return (
    <PanelSection title="Funil da realidade aumentada">
      <ul className="space-y-3">
        {steps.map((step, index) => {
          const previous = index === 0 ? step.value : steps[index - 1]!.value;
          return (
            <li key={step.label}>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink-soft">{step.label}</span>
                <span className="tabular font-medium">
                  {step.value.toLocaleString('pt-BR')}
                  {index > 0 && (
                    <span className="ml-1.5 text-muted">{formatPercent(rate(step.value, previous))}</span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-deep">
                <div
                  className={index === 1 || index === 2 ? 'ember-rule h-full' : 'h-full bg-teal'}
                  style={{ width: `${Math.max(2, (step.value / top) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[13px] text-muted">
        {metrics.ar_opens > 0
          ? `${formatPercent(rate(metrics.ar_opens, metrics.product_views))} de quem abre um prato com modelo 3D experimenta a AR.`
          : 'Cadastre modelos 3D nos produtos para começar a medir a AR.'}
      </p>
    </PanelSection>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #E4E0DA',
  fontSize: 13,
  boxShadow: 'none',
} as const;

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-[14px] text-faint">{message}</div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Panel key={index} className="p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-28" />
          </Panel>
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-[10px]" />
    </div>
  );
}
