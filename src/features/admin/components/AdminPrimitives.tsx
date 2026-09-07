import type { ReactNode } from 'react';

import { Panel } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Cabeçalho padrão das telas do painel. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] leading-tight">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PanelSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel as="section" className={cn('p-4', className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Panel>
  );
}

/**
 * Tabela do painel.
 *
 * Rola horizontalmente dentro do próprio contêiner: uma tabela larga nunca deve
 * empurrar a página inteira para o lado no celular.
 */
export function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-hairline bg-paper">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-10 text-center text-[14px] text-faint">
                Nada por aqui ainda.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-[14px] align-middle', className)}>{children}</td>;
}
