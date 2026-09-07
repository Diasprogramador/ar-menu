# AR Menu

Plataforma SaaS multi-tenant de cardápio digital em que o cliente do restaurante
escaneia um QR Code, escolhe um prato e o vê **em realidade aumentada, em escala
aproximada 1:1, sobre a própria mesa**.

A realidade aumentada é implementada de verdade: sessão WebXR com detecção de
superfície por `hit-test`, escala derivada das dimensões físicas cadastradas pelo
restaurante, e degradação em cascata para AR Quick Look (iOS) ou visualizador 3D
interativo quando o aparelho não suporta o caminho imersivo.

**No ar:** [cardápio de demonstração](https://ar-menu-tau-opal.vercel.app/r/brasa-e-mesa)
· [página do produto](https://ar-menu-tau-opal.vercel.app)

---

## Stack

| Camada | Escolha |
|---|---|
| Interface | React 19, TypeScript estrito, Vite 8 |
| Estilo | Tailwind CSS v4 (`@theme`), sistema de design próprio |
| 3D e AR | three.js, WebXR (`immersive-ar` + `hit-test`), AR Quick Look |
| Backend | Supabase — PostgreSQL, Auth, Storage, Realtime |
| Segurança | Row Level Security em todas as tabelas com dono |
| Estado | Zustand (carrinho, avisos), contexto React (sessão, cardápio) |
| Gráficos | Recharts |
| PWA | vite-plugin-pwa (Workbox) |
| Testes | Vitest + Testing Library |

---

## Como rodar

### 1. Dependências

```bash
npm install
```

### 2. Banco de dados

Com a [CLI do Supabase](https://supabase.com/docs/guides/cli) instalada:

```bash
supabase start
supabase db reset
```

`db reset` aplica as quatro migrations de `supabase/migrations/` e carrega
`supabase/seed.sql`, que cria o restaurante de demonstração **Brasa & Mesa** com
6 categorias, 19 produtos, 12 modelos 3D, 12 mesas, QR Codes, 30 dias de pedidos
e eventos de analytics — o painel abre com números reais, não com telas vazias.

O seed também cria a conta local de demonstração:

```
demo@brasaemesa.com.br
brasa1234
```

> Em projeto hospedado no Supabase, a criação direta em `auth.users` pode ser
> recusada. Nesse caso, crie a conta em `/admin/cadastro` e vincule-a ao
> restaurante inserindo uma linha em `restaurant_memberships` com `role = 'owner'`.

### 3. Variáveis de ambiente

Esta etapa é opcional para ver o cardápio funcionando — veja *Modo demonstração*
mais abaixo. Ela é obrigatória para o painel do restaurante.

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
VITE_APP_URL=http://localhost:5173
```

Use sempre a chave **anon**. A `service_role` ignora as políticas de RLS e nunca
pode ir para o navegador — o app recusa iniciar se detectar essa chave no `.env`.

### 4. Desenvolvimento

```bash
npm run dev
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Typecheck + build de produção |
| `npm run check` | Lint + typecheck + testes |
| `npm test` | Suíte de testes |
| `npm run gen:models` | Regera os 12 modelos de demonstração em GLB e USDZ |
| `npm run gen:icons` | Regera os ícones PNG do PWA |

---

## Modo demonstração

Sem as chaves do Supabase, o cardápio público não mostra tela de erro: ele serve
o catálogo estático de `src/features/menu/demoData.ts`, equivalente ao
`seed.sql`. É assim que a versão publicada funciona — cardápio, prato,
realidade aumentada e pedido rodam de ponta a ponta sem backend.

| | Com `.env` preenchido | Sem `.env` |
|---|---|---|
| Cardápio, prato, AR | Supabase com RLS | catálogo estático |
| Pedido | RPC `create_order`, total do servidor | salvo no `localStorage` |
| Analytics | RPC `track_event` | não registra |
| Painel `/admin` | completo | tela explicando o que configurar |

O comprovante avisa explicitamente quando o pedido ficou só no aparelho. A
troca é decidida em um lugar só, `env.isConfigured`, e o mesmo código atende os
dois casos.

---

## Testar a realidade aumentada

A AR imersiva exige **contexto seguro**: HTTPS ou `localhost`. Como o celular
acessa a máquina de desenvolvimento por IP, `http://192.168.x.x:5173` não serve.

Duas saídas:

```bash
# Túnel HTTPS temporário
npx localtunnel --port 5173
```

ou publique em qualquer host com HTTPS (Vercel, Netlify, Cloudflare Pages).

**Suporte por plataforma**

| Plataforma | Caminho | Requisito |
|---|---|---|
| Android + Chrome/Edge | WebXR `immersive-ar` | Google Play Services for AR |
| iOS + Safari | AR Quick Look | arquivo `.usdz` do produto (os 12 de demonstração já vêm prontos) |
| Desktop, navegadores sem WebXR | Visualizador 3D | WebGL |
| Sem WebGL | Ficha do prato com fotos | — |

Nenhum desses caminhos leva a uma tela quebrada, e o botão de adicionar ao
pedido está presente em todos.

---

## Estrutura

```
src/
├─ components/          casca da aplicação e sistema de design (ui/)
├─ features/
│  ├─ admin/            painel: dashboard, catálogo, mesas, QR Codes, ajustes
│  ├─ ar/               capacidades, escala física, sessão WebXR, tela de AR
│  ├─ auth/             sessão, papéis, telas de conta
│  ├─ cart/             carrinho e fechamento do pedido
│  ├─ landing/          página comercial
│  ├─ menu/             cardápio público
│  ├─ models3d/         carregamento, medição e visualização de GLB
│  ├─ orders/           criação e acompanhamento de pedidos
│  └─ qrcodes/          geração, download e folha de impressão
├─ lib/                 supabase, analytics, formatação, SEO, utilidades
└─ types/               tipos do banco

supabase/migrations/    schema, RLS, funções RPC, storage
scripts/                geradores de modelos 3D e ícones
docs/                   arquitetura, decisões de AR, segurança
```

Leitura recomendada: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md),
[`docs/AR.md`](docs/AR.md) e [`docs/SEGURANCA.md`](docs/SEGURANCA.md).

---

## Decisões que valem explicação

**Dinheiro só em centavos inteiros, e o total é do servidor.**
Nenhuma soma de preço usa ponto flutuante. O carrinho no navegador calcula
apenas o que se mostra na tela; o valor cobrado sai da função `create_order`, que
recalcula tudo a partir do banco com os produtos travados por `FOR UPDATE`. Um
total enviado pelo cliente seria uma sugestão editável no DevTools.

**Tenant isolado no banco, não no frontend.**
Toda tabela com dono tem RLS e políticas separadas por operação, apoiadas em
`restaurant_memberships`. Contornar o roteador não dá acesso a nada.

**Escala física é dado, não chute.**
O produto guarda largura, altura, profundidade e diâmetro em centímetros. Na hora
de renderizar, o bounding box do GLB é medido e comparado com essas medidas. É
isso que corrige modelos exportados em centímetros ou polegadas — e o painel
avisa o restaurante quando o número resultante indica unidade errada.

**Zoom com trava.**
O cliente amplia entre 0,5× e 2× do tamanho real, com um botão de voltar ao 1:1.
Pinça livre destruiria a única promessa que a AR faz aqui.

**Modelos 3D de demonstração são gerados, não baixados.**
`scripts/generate-demo-models.mjs` constrói os 12 GLB proceduralmente com three.js,
com origem no centro da base e 1 unidade = 1 metro. Assets de terceiros vêm com
unidade, pivô e orientação arbitrários — exatamente o que quebra a escala 1:1.

**three.js não entra no bundle do cardápio.**
O build separa `three` (657 kB) num chunk próprio, carregado só quando o cliente
toca em "Ver na minha mesa". Recharts idem, só no painel.

---

## Limitações conhecidas

- **AR no iPhone depende de USDZ por produto.** O iOS não implementa WebXR, e o
  Quick Look só abre a partir de um `.usdz`. Os 12 pratos de demonstração já
  saem nos dois formatos (`npm run gen:models`), mas um prato novo enviado pelo
  painel só ganha AR nativa no iPhone quando o restaurante subir também o USDZ.
  Converter GLB → USDZ no servidor é o próximo passo.
- **SEO é client-side.** Títulos, Open Graph e JSON-LD são aplicados no
  navegador. Rastreadores que executam JavaScript leem normalmente; para
  indexação garantida, o próximo passo é pré-renderizar as rotas públicas.
- **Pagamento não está implementado.** O schema já separa `payment_status`,
  `payment_provider` e `payment_reference`, e a assinatura isola os campos do
  provedor — mas nenhuma cobrança real acontece. O pedido é pago no caixa.
- **Imagens de demonstração vêm do Unsplash.** São URLs externas no seed; se
  alguma sair do ar, a interface mostra o fallback com a inicial do prato em vez
  de imagem quebrada. Fotos próprias substituem tudo pelo upload no painel.
- **O modo demonstração não substitui o banco.** Ele existe para a vitrine
  pública. Multi-tenant, papéis, métricas e totais autoritativos só valem com o
  Supabase configurado.

---

## Licença

Projeto acadêmico e de portfólio. Modelos 3D e ícones gerados neste repositório
são originais.
