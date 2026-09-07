import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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

/**
 * Métricas detalhadas.
 *
 * A pergunta que esta tela responde é comercial, não técnica: a realidade
 * aumentada aumenta a conversão? Por isso os pratos com modelo 3D e os sem
 * aparecem lado a lado na mesma comparação.
 */
export default function AnalyticsPage() {
  const { activeRestaurant } = useAuth();
  const [days, setDays] = useState(30);

  useSeo({ title: 'Métricas — AR Menu', noIndex: true });

  const metrics = useResource(
    () => getMetrics(activeRestaurant!.id, days),
    [activeRestaurant?.id, days],
  );

  if (!activeRestaurant) return null;

  const data = metrics.data;

  const conversionByProduct = (data?.top_viewed ?? []).map((item) => ({
    nome: item.product_name.length > 18 ? `${item.product_name.slice(0, 17)}…` : item.product_name,
    visualizacoes: item.views,
    aberturasAR: item.ar_opens,
    temAR: item.ar_opens > 0,
  }));

  const dailySeries = (data?.daily ?? []).map((point) => ({
    dia: new Date(point.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    pedidos: point.orders,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Métricas"
        description="Como o cardápio digital e a realidade aumentada estão convertendo."
        actions={
          <div className="flex rounded-[6px] border border-hairline p-0.5">
            {[7, 30, 90].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                aria-pressed={days === option}
                className={
                  days === option
                    ? 'rounded-[4px] bg-teal px-3 py-1.5 text-[13px] font-medium text-white'
                    : 'rounded-[4px] px-3 py-1.5 text-[13px] text-muted hover:text-ink'
                }
              >
                {option} dias
              </button>
            ))}
          </div>
        }
      />

      {metrics.status === 'loading' && !data && <Skeleton className="h-96 w-full rounded-[10px]" />}
      {metrics.status === 'error' && !data && (
        <ErrorState message={metrics.error} onRetry={metrics.reload} />
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Sessões"
              value={data.sessions.toLocaleString('pt-BR')}
              detail="visitantes únicos no cardápio"
            />
            <StatTile
              label="Pratos visualizados"
              value={data.product_views.toLocaleString('pt-BR')}
            />
            <StatTile
              label="Taxa de AR"
              value={formatPercent(rate(data.ar_opens, data.product_views))}
              detail="de quem vê um prato abre a AR"
              tone="ember"
            />
            <StatTile
              label="Ticket médio"
              value={formatMoney(data.avg_ticket_cents, activeRestaurant.currency)}
              tone="teal"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <PanelSection title="Visualizações e aberturas de AR por prato">
              {conversionByProduct.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={conversionByProduct} margin={{ top: 8, right: 8, left: -20, bottom: 40 }}>
                    <CartesianGrid stroke="#E4E0DA" vertical={false} />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: '#97918A' }}
                      tickLine={false}
                      axisLine={false}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#97918A' }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#F6F4F1' }} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="visualizacoes" name="Visualizações" fill="#0F4C5C" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="aberturasAR" name="Aberturas de AR" radius={[3, 3, 0, 0]}>
                      {conversionByProduct.map((entry, index) => (
                        <Cell key={index} fill={entry.temAR ? '#FF6B2C' : '#E4E0DA'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </PanelSection>

            <PanelSection title="Pedidos por dia">
              {dailySeries.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dailySeries} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid stroke="#E4E0DA" vertical={false} />
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 11, fill: '#97918A' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#97918A' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="pedidos"
                      name="Pedidos"
                      stroke="#0F4C5C"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </PanelSection>
          </div>

          <PanelSection title="Funil completo" className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-hairline text-[12px] uppercase tracking-[0.05em] text-muted">
                    <th className="py-2">Etapa</th>
                    <th className="py-2 text-right">Eventos</th>
                    <th className="py-2 text-right">Da etapa anterior</th>
                    <th className="py-2 text-right">Do total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {[
                    ['Prato visualizado', data.product_views],
                    ['Realidade aumentada aberta', data.ar_opens],
                    ['Prato posicionado na mesa', data.ar_placements],
                    ['Adicionado ao carrinho', data.cart_adds],
                    ['Pedido finalizado', data.orders_created],
                  ].map(([label, value], index, list) => {
                    const previous = index === 0 ? Number(value) : Number(list[index - 1]![1]);
                    return (
                      <tr key={String(label)}>
                        <td className="py-2.5">{label}</td>
                        <td className="tabular py-2.5 text-right font-medium">
                          {Number(value).toLocaleString('pt-BR')}
                        </td>
                        <td className="tabular py-2.5 text-right text-muted">
                          {index === 0 ? '—' : formatPercent(rate(Number(value), previous))}
                        </td>
                        <td className="tabular py-2.5 text-right text-muted">
                          {formatPercent(rate(Number(value), data.product_views))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-[13px] text-muted">
              Eventos são registrados de forma anônima, sem identificar o cliente. A sessão é um
              identificador temporário que some quando a aba é fechada.
            </p>
          </PanelSection>

          <Panel className="mt-4 p-4">
            <p className="text-[14px]">
              <strong className="font-semibold">Leitura rápida:</strong>{' '}
              {data.ar_opens === 0
                ? 'ainda não há dados de AR neste período. Cadastre modelos 3D nos pratos mais pedidos para começar a comparar.'
                : `${formatPercent(rate(data.ar_placements, data.ar_opens))} de quem abre a realidade aumentada chega a posicionar o prato na mesa, e ${formatPercent(rate(data.cart_adds, data.product_views))} dos pratos vistos viram item no carrinho.`}
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #E4E0DA',
  fontSize: 13,
  boxShadow: 'none',
} as const;

function EmptyChart() {
  return (
    <div className="flex h-[240px] items-center justify-center text-[14px] text-faint">
      Sem dados no período selecionado.
    </div>
  );
}
