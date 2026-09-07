# Segurança

O produto é multi-tenant: um restaurante nunca pode ler nem escrever dados de
outro. Como não existe servidor de aplicação próprio, a fronteira precisa estar
no banco. Verificação no frontend aqui é usabilidade, não segurança.

---

## Modelo de ameaça

Quem pode atacar, e com o quê:

| Agente | Tem | Quer |
|---|---|---|
| Cliente do restaurante | chave anon, DevTools | pedir de graça, ver pedido alheio |
| Restaurante concorrente | conta própria válida | ler cardápio, pedidos e métricas de outro |
| Funcionário com papel `staff` | conta válida limitada | mexer em preço ou configuração |
| Visitante qualquer | a URL pública | listar dados administrativos |

A chave `anon` do Supabase é pública por definição — ela vai no bundle. O que
impede o abuso são as políticas de RLS, não o segredo da chave.

---

## Camadas

```
1. Roteador          redireciona quem não está logado        (usabilidade)
2. Interface         esconde ação que o papel não tem        (usabilidade)
3. Serviço           valida entrada antes de chamar o banco  (feedback)
4. RLS               decide o que pode ser lido e escrito    ← fronteira real
5. Função RPC        recalcula o que não se pode confiar     ← fronteira real
```

As camadas 1 a 3 existem para a pessoa não bater numa parede sem explicação. Se
todas forem removidas, nada vaza.

---

## Row Level Security

Toda tabela com dono tem RLS habilitado e políticas **separadas por operação**.
Uma política `FOR ALL` esconde o caso em que ler deveria ser permitido e escrever
não.

### Leitura pública

`anon` lê apenas o necessário para o cardápio funcionar:

```sql
create policy products_public_read on public.products
  for select to anon
  using (public.restaurant_is_public(restaurant_id));
```

`restaurant_is_public` confirma que o restaurante existe e está ativo.
Desativar um restaurante tira o cardápio do ar imediatamente, sem migração.

Ficam **fora** do alcance do `anon`: `orders`, `order_items`, `analytics_events`,
`qr_codes`, `profiles`, `restaurant_memberships` e `restaurant_subscriptions`.

### Escrita autenticada

```sql
create policy products_member_update on public.products
  for update to authenticated
  using      (public.has_restaurant_role(restaurant_id, array['owner','admin']))
  with check (public.has_restaurant_role(restaurant_id, array['owner','admin']));
```

`using` filtra o que pode ser alterado; `with check` valida o resultado. Sem o
segundo, alguém poderia mover uma linha para outro `restaurant_id` na atualização.

### Papéis

| | owner | admin | staff |
|---|:---:|:---:|:---:|
| Ver pedidos | ✓ | ✓ | ✓ |
| Mudar status do pedido | ✓ | ✓ | ✓ |
| Editar catálogo | ✓ | ✓ | — |
| Mesas e QR Codes | ✓ | ✓ | — |
| Métricas | ✓ | ✓ | — |
| Configurações | ✓ | ✓ | — |
| Equipe e cobrança | ✓ | — | — |

Um `owner` não consegue remover a si mesmo — a política de `delete` em
`restaurant_memberships` exige `user_id <> auth.uid()`, para que o restaurante
não fique órfão.

---

## O que o cliente não pode decidir

### Total do pedido

`create_order` recebe apenas identificadores e quantidades. Preço, adicionais e
total vêm do banco, com `SELECT ... FOR UPDATE` no produto para que o valor não
mude entre a leitura e a gravação.

Tentativas que a função recusa:

- produto de outro restaurante → `Produto indisponível no cardápio deste restaurante`;
- produto marcado como indisponível → recusa nominal;
- quantidade fora de 1–99 → recusa;
- adicional de outro produto ou inativo → ignorado no cálculo;
- mais de 50 itens distintos → recusa.

### Nome do evento de analytics

`track_event` compara contra uma lista branca no banco. O `product_id` é anulado
se não pertencer ao restaurante informado, e o `session_id` é truncado em 64
caracteres.

### Leitura do próprio pedido

`get_order_by_code` exige o par `(código, session_id)`. Saber o código de outra
mesa não basta.

---

## Storage

Três buckets, com caminho no formato:

```
restaurants/{restaurantId}/products/{productId}/model.glb
```

A política extrai o segundo segmento do caminho e confirma o papel:

```sql
create policy product_models_member_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-models'
              and public.storage_path_is_writable(name));
```

A função rejeita caminho que não comece com `restaurants/`, `uuid` malformado ou
pessoa sem papel de owner/admin naquele restaurante.

Limites aplicados no bucket, não só na interface: 5 MB para imagem, 25 MB para
modelo, com lista de MIME types permitidos.

Leitura é pública nos três buckets — o visualizador 3D precisa buscar o `.glb`
direto do CDN, e URL assinada por arquivo adicionaria latência à parte mais cara
do fluxo. Nenhum documento sensível vive ali.

---

## Segredos

Só entram no bundle variáveis `VITE_*`. O `env.ts` recusa iniciar a aplicação se
detectar `service_role` na chave anon — essa chave ignora RLS por completo, e o
erro de colar a errada no `.env` é comum o bastante para merecer uma trava.

Ficam fora do navegador, sem exceção: `service_role`, senha do banco, segredo de
webhook, chave de provedor de pagamento.

---

## Entrada

| Camada | O que valida |
|---|---|
| Banco | `CHECK` em preço, dimensões, formato de slug, código de mesa, quantidade |
| Banco | `UNIQUE` em slug por restaurante, código de pedido por restaurante |
| RPC | pertencimento, disponibilidade, limites, lista branca de eventos |
| Serviço | tipo e tamanho de arquivo antes do upload |
| Interface | dimensões absurdas, regras de seleção de adicionais |

Tipo de TypeScript não é validação em tempo de execução. Toda entrada que chega
do navegador tem verificação no banco.

---

## Privacidade

- A câmera é solicitada só quando o cliente inicia a AR, e a sessão encerra ao
  sair da tela.
- Nenhum quadro da câmera é lido, gravado ou enviado.
- O identificador de sessão do cliente é anônimo, vive no `sessionStorage` e some
  quando a aba fecha.
- O pedido guarda nome e telefone apenas quando o cliente digita.
- O `robots.txt` bloqueia `/admin`, e as telas do painel enviam
  `noindex, nofollow`.

---

## Checklist antes de publicar

- [ ] `.env` com a chave **anon**, nunca `service_role`
- [ ] `supabase db reset` aplicou as quatro migrations
- [ ] RLS habilitado em todas as tabelas com dono
- [ ] Confirmação manual: conta do restaurante A não lê dados do restaurante B
- [ ] Conta `staff` não consegue editar preço
- [ ] `create_order` recusa produto de outro restaurante
- [ ] Upload rejeita caminho fora de `restaurants/{proprio-id}/`
- [ ] Aplicação servida sob HTTPS (requisito da AR e do service worker)
- [ ] `npm run check` passando
