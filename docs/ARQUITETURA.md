# Arquitetura

## Visão geral

```
                    ┌──────────────────────────────┐
   QR Code ────────▶│  Cardápio público  (anon)    │
                    │  /r/:slug                    │
                    └──────────────┬───────────────┘
                                   │  chave anon + RLS
                    ┌──────────────▼───────────────┐
                    │        Supabase              │
                    │  PostgreSQL · Auth           │
                    │  Storage · Realtime          │
                    └──────────────▲───────────────┘
                                   │  chave anon + RLS + papel
                    ┌──────────────┴───────────────┐
   Login ──────────▶│  Painel  (authenticated)     │
                    │  /admin                      │
                    └──────────────────────────────┘
```

Não existe servidor de aplicação próprio. O que normalmente seria uma camada de
API vive no banco, como políticas de RLS e funções `SECURITY DEFINER`. A decisão
tem uma consequência que orienta todo o resto: **o navegador nunca é fonte de
verdade**, nem para autorização nem para dinheiro.

---

## Organização por funcionalidade

```
src/features/<domínio>/
├─ <Domínio>Service.ts    acesso a dados, tipado, sem JSX
├─ components/            componentes do domínio
├─ pages/                 telas roteadas
└─ *.test.ts              testes das regras puras
```

A alternativa comum — pastas `components/`, `hooks/`, `services/` no topo —
espalha uma mudança de carrinho por quatro diretórios. Aqui, mexer no carrinho é
mexer em `features/cart/`.

`src/components/ui/` guarda apenas o que é genuinamente transversal: botão,
campo, painel, folha modal, estados vazios e de erro.

---

## Fronteira de dados

Componentes não montam consultas. Cada domínio expõe funções tipadas:

```ts
getMenu(slug)                         → MenuData | null
getProductDetail(restaurantId, slug)  → ProductDetail | null
createOrder(input)                    → CreatedOrder
getMetrics(restaurantId, days)        → RestaurantMetrics
```

Três consequências práticas:

1. **Sem N+1 na rede do cliente.** `getMenu` traz restaurante, categorias e
   produtos com o modelo 3D embutido em uma ida — a rede do restaurante costuma
   ser a pior do fluxo inteiro.
2. **Projeção explícita.** As consultas listam colunas. O payload público não
   carrega campo que a interface não usa.
3. **Erro traduzido uma vez.** `toDataError` converte código do PostgREST em
   mensagem legível, sem vazar detalhe interno do banco para a tela.

O PostgREST devolve relação 1:1 ora como objeto, ora como array de um elemento,
dependendo de como a chave estrangeira foi inferida. A normalização acontece uma
vez no serviço; o resto do app lida sempre com `ProductModel | null`.

---

## Multi-tenant

`restaurants.id` é a fronteira. Toda tabela com dono carrega `restaurant_id`
direto, mesmo quando existe caminho relacional — isso deixa as políticas de RLS
legíveis e evita `join` dentro de cada verificação.

```
auth.users
    └── profiles
            └── restaurant_memberships (owner | admin | staff)
                    └── restaurants
                            ├── categories → products → product_addons
                            │                        └── product_models
                            ├── tables → qr_codes
                            ├── orders → order_items
                            ├── analytics_events
                            └── restaurant_subscriptions
```

Três funções `SECURITY DEFINER` sustentam as políticas:

| Função | Pergunta |
|---|---|
| `is_member(restaurant_id)` | esta pessoa pertence a este restaurante? |
| `has_restaurant_role(restaurant_id, papéis[])` | e com qual papel? |
| `restaurant_is_public(restaurant_id)` | este restaurante está ativo? |

Elas são `SECURITY DEFINER` para não disparar RLS recursiva ao consultar
`restaurant_memberships` de dentro das próprias políticas.

Detalhe da UX de papéis: `ROLE_CAPABILITIES`, em `AuthProvider.tsx`, decide o que
a interface mostra. Ele **espelha** as políticas do banco, não as substitui — se
os dois divergirem, a pessoa vê um botão que o banco recusa, e a mensagem de erro
fica sem sentido. Por isso existe um teste comparando os dois.

---

## Escrita: onde ela acontece

| Operação | Caminho | Por quê |
|---|---|---|
| Catálogo, mesas, ajustes | tabela direto, com RLS | membro autenticado, política resolve |
| Criar pedido | RPC `create_order` | totais precisam ser calculados no servidor |
| Consultar pedido | RPC `get_order_by_code` | exige o par (código, sessão) |
| Registrar evento | RPC `track_event` | lista branca de eventos no banco |
| Criar restaurante | RPC `create_restaurant` | quatro inserções numa transação só |
| Métricas | RPC `restaurant_metrics` | agregação pesada perto do dado |

### Criação de pedido

O navegador manda apenas `product_id`, `quantity`, `notes` e `addon_ids`. A
função:

1. resolve o restaurante pelo slug e confirma que está ativo;
2. resolve a mesa, se houver;
3. para cada item, lê o produto com `FOR UPDATE` — o preço não pode mudar entre
   a leitura e a gravação;
4. confirma que o produto pertence ao restaurante e está disponível;
5. filtra os adicionais, aceitando só os que pertencem àquele produto e estão
   ativos;
6. calcula `(preço + adicionais) × quantidade` por linha e soma o total;
7. grava o **snapshot comercial** em `order_items`: nome, preço unitário,
   adicionais e total da linha no momento da compra.

O passo 7 é o que permite reajustar preços sem reescrever o histórico. Um pedido
de três meses atrás continua mostrando o que foi cobrado.

`restaurant_metrics` é `SECURITY INVOKER` de propósito: as políticas de RLS
continuam valendo, então um membro só consegue agregar dados do próprio
restaurante mesmo passando outro `restaurant_id`.

---

## Dinheiro

Preço é `integer` em centavos, do banco à tela. Nenhuma soma usa ponto flutuante.

O carrinho calcula subtotais para mostrar, e só. O valor cobrado sai do banco. Um
total enviado pelo cliente seria editável no DevTools.

---

## Divisão do bundle

O corte segue o público de cada rota:

| Chunk | Tamanho | Quando chega ao aparelho |
|---|---|---|
| `index` | 256 kB | sempre — React, router, casca |
| `supabase` | 210 kB | sempre — cliente do banco |
| `three` | 657 kB | ao tocar em "Ver na minha mesa" |
| `charts` | 412 kB | ao abrir o painel |
| páginas | 5–29 kB | por rota |

Quem escaneia o QR Code e olha o cardápio nunca baixa o three.js nem o Recharts.
Dentro da página de produto há um segundo corte: o componente de AR só é
importado quando o cliente pede.

---

## PWA e cache

A estratégia por tipo de recurso resolve o problema clássico de cardápio digital
— preço velho na tela:

| Recurso | Estratégia | Motivo |
|---|---|---|
| Consultas ao banco | `NetworkFirst`, 4 s, expira em 5 min | preço nunca pode ficar velho |
| Imagens | `StaleWhileRevalidate`, 14 dias | foto muda pouco |
| Modelos `.glb` | `CacheFirst`, 30 dias | arquivo imutável e caro |
| Casca do app | precache | abre offline |

Os modelos ficam fora do precache (`globIgnores`): baixar o catálogo 3D inteiro
na primeira visita seria o oposto do que o produto precisa.

`/admin` está no `navigateFallbackDenylist` — o painel não deve ser servido a
partir do cache offline.

---

## Estados de tela

Todo fluxo importante define quatro estados: carregando, pronto, vazio e erro.
O hook `useResource` padroniza isso e resolve dois problemas recorrentes:
`setState` depois do unmount, e a lista sumir da tela durante um recarregamento
(os dados anteriores permanecem visíveis enquanto o novo carregamento acontece).

`ErrorBoundary` é a última barreira: um erro de render em qualquer ponto da
árvore derruba o React inteiro, e sem ele o cliente ficaria olhando para uma
página branca com o celular na mão.

---

## Preparado para o que vem depois

| Extensão | O que já existe |
|---|---|
| Pagamento online | `payment_status`, `payment_provider`, `payment_reference` em `orders` |
| Cobrança da assinatura | `restaurant_subscriptions` com campos do provedor isolados |
| Planos e limites | `subscription_plans.entitlements` em JSONB, lido por feature |
| Múltiplas unidades | `restaurant_memberships` já é N:N; o seletor de restaurante existe |
| Integração com PDV | `orders` e `order_items` são snapshot completo, exportável |
| Outros idiomas | `restaurants.locale` e `currency` já atravessam a formatação |

Nenhum desses pontos exige rever o modelo de dados. É o que separa "preparado
para produção" de "funciona na demonstração".
