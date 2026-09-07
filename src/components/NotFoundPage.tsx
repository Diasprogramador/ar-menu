import { Link } from 'react-router-dom';

import { useSeo } from '@/lib/seo';

export default function NotFoundPage() {
  useSeo({ title: 'Página não encontrada — AR Menu', noIndex: true });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-px w-12 ember-rule" />
      <p className="tabular font-mono text-sm text-faint">404</p>
      <h1 className="font-display text-3xl">Essa página não existe</h1>
      <p className="max-w-sm text-sm text-muted">
        O endereço pode ter mudado ou o QR Code aponta para um cardápio que saiu do ar.
      </p>
      <Link
        to="/"
        className="mt-2 flex h-11 items-center rounded-[8px] bg-ink px-5 text-[15px] font-medium text-paper"
      >
        Ir para o início
      </Link>
    </main>
  );
}
