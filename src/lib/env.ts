/**
 * Leitura única e validada das variáveis de ambiente do cliente.
 *
 * Só entram aqui variáveis com prefixo VITE_, ou seja, expostas no bundle.
 * Segredos (service role, webhooks, chaves de pagamento) nunca passam por
 * este arquivo — eles vivem no servidor.
 */
type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appUrl: string;
  isConfigured: boolean;
};

function read(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  return typeof value === 'string' ? value.trim() : '';
}

const supabaseUrl = read('VITE_SUPABASE_URL');
const supabaseAnonKey = read('VITE_SUPABASE_ANON_KEY');

/**
 * Valores que vêm do `.env.example`. Quem copia o arquivo e esquece de
 * preencher tem um `.env` sintaticamente válido apontando para lugar nenhum —
 * o que produziria erro de rede em toda consulta. Tratamos como não
 * configurado.
 */
const PLACEHOLDERS = ['https://seu-projeto.supabase.co', 'sua-chave-anon'];

const looksReal =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  supabaseUrl.startsWith('http') &&
  !PLACEHOLDERS.includes(supabaseUrl) &&
  !PLACEHOLDERS.includes(supabaseAnonKey);

/**
 * `isConfigured` decide entre falar com o banco e servir o catálogo de
 * demonstração. Sem ele, quem clona o repositório sem criar o .env veria uma
 * tela de erro em vez do produto.
 */
export const env: PublicEnv = {
  supabaseUrl,
  supabaseAnonKey,
  appUrl: read('VITE_APP_URL') || (typeof window !== 'undefined' ? window.location.origin : ''),
  isConfigured: looksReal,
};

/**
 * A chave `anon` é pública por definição do Supabase: a proteção real está nas
 * políticas de RLS. Mas uma `service_role` no bundle seria vazamento grave,
 * então falhamos alto se alguém colar a chave errada no .env.
 */
if (supabaseAnonKey.includes('service_role')) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY contém uma service_role key. Essa chave ignora RLS e ' +
      'nunca pode ir para o navegador. Use a chave anon do projeto.',
  );
}
