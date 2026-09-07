import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Moldura das telas de conta.
 *
 * Duas colunas no desktop: o formulário fica à esquerda, com largura de leitura
 * confortável, e a coluna escura da direita carrega a única aparição do
 * gradiente de brasa nesta área — lembrando de que produto se trata sem
 * competir com o campo de senha.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_44%]">
      <main className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="h-px w-6 ember-rule" aria-hidden />
            <span className="font-display text-[17px]">AR Menu</span>
          </Link>

          <h1 className="mt-8 font-display text-[32px] leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-[14px] text-muted">{footer}</div>}
        </div>
      </main>

      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="h-px w-16 ember-rule" />
          <p className="mt-6 max-w-sm font-display text-[30px] leading-tight text-paper">
            Seu cliente vê o prato antes de pedir.
          </p>
          <p className="mt-3 max-w-sm text-[15px] text-paper/60">
            Cardápio digital, QR Code por mesa e realidade aumentada em escala real — no navegador,
            sem aplicativo para instalar.
          </p>
        </div>
      </aside>
    </div>
  );
}
