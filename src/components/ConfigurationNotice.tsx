/**
 * Tela mostrada quando falta o .env.
 *
 * Sem as variáveis do Supabase o app não tem banco, então falhar cedo e
 * explicar o que fazer é melhor do que deixar cada consulta estourar um erro de
 * rede diferente pela aplicação.
 */
export function ConfigurationNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12">
      <div className="h-px w-12 ember-rule" />
      <h1 className="mt-5 font-display text-3xl">Falta configurar o Supabase</h1>
      <p className="mt-3 text-muted">
        Crie um arquivo <code className="rounded bg-surface px-1 py-0.5 font-mono text-sm">.env</code> na
        raiz do projeto com as chaves públicas do seu projeto Supabase:
      </p>

      <pre className="mt-5 overflow-x-auto rounded-[8px] border border-hairline bg-surface p-4 font-mono text-[13px] leading-relaxed">
        {`VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
VITE_APP_URL=http://localhost:5173`}
      </pre>

      <p className="mt-5 text-sm text-muted">
        Use sempre a chave <strong>anon</strong>. A <code className="font-mono">service_role</code> ignora
        as políticas de segurança do banco e nunca pode ir para o navegador.
      </p>

      <p className="mt-3 text-sm text-muted">
        Depois rode <code className="rounded bg-surface px-1 py-0.5 font-mono">supabase db reset</code>{' '}
        para aplicar as migrations e carregar o restaurante de demonstração.
      </p>
    </main>
  );
}
