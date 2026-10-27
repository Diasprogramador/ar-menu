# Brasa & Mesa — sistema visual do cardápio

## 1. Objetivo

Transformar o cardápio público em uma vitrine gastronômica reconhecível, que desperte apetite e
deixe preço, tempo de preparo, disponibilidade e acesso à AR fáceis de encontrar em um celular.
O estado mais frequente é a pessoa com fome, em uma mesa, comparando pratos rapidamente.

## 2. Contexto do produto

- Público: clientes de um restaurante casual-premium de brasa, no salão ou decidindo o pedido.
- Trabalho principal: descobrir um prato, entender o que vem nele e adicioná-lo ao pedido.
- Personalidade: cozinha de fogo, serviço direto e cuidado artesanal; nunca startup genérica.
- Escopo: cardápio público, categorias, detalhe do prato, carrinho e comprovante. O painel
  administrativo mantém padrões convencionais de software e não herda ornamentos editoriais.

## 3. Fundamentos visuais

### Cor

- `--ink #18120F`: carvão, fundos de alto contraste e ações principais.
- `--paper #F6F0E5`: papel de comanda, superfície principal.
- `--surface #EDE4D5`: separação de blocos e campos.
- `--ember #F05A28`: brasa, reservado a AR, estados ativos e pequenos acentos.
- `--wine #6F1D1B`: calor escuro para promoções e profundidade.
- `--herb #49624A`: frescor e estados positivos.

### Tipografia

- Display: Fraunces 600/700; nomes de pratos e títulos de seção, com contraste editorial.
- Interface: Inter Tight 400–700; descrições, ações e leitura rápida.
- Utilitária: Cascadia Code/monospace; índices de categoria, tempos e pequenas legendas.
- Escala móvel: 12 / 13 / 15 / 18 / 24 / 34 / 48 px. Corpo nunca abaixo de 14 px.

### Layout

- Mobile-first, leitura máxima de 720 px e imagens que ultrapassam deliberadamente a coluna.
- A home alterna módulos editoriais: capa, índice horizontal, seleção da casa, faixa AR e seções.
- Listas usam ritmo de “comanda”: índice, título, descrição, preço e imagem; não uma grade de
  cartões idênticos.

### Assinatura

O recorte diagonal de brasa aparece em capas e módulos-chave como referência à grelha e ao fogo.
As imagens do catálogo demo são renders locais dos próprios modelos 3D, sobre um estúdio escuro
consistente; assim a fotografia promete exatamente o prato que a AR entrega.

## 4. Acessibilidade

- Contraste mínimo WCAG AA, foco visível e alvos de toque de pelo menos 44 px.
- Informação nunca depende apenas de cor; AR, promoção e disponibilidade têm rótulos textuais.
- Imagens têm texto alternativo com o nome do prato; elementos atmosféricos são decorativos.
- Movimento é discreto e removido com `prefers-reduced-motion`.

## 5. Voz e tom

Direto, sensorial e específico. Usar ingredientes, técnica e tempo real (“defumada 12 horas”),
nunca frases vagas. Ações descrevem o resultado: “Ver na minha mesa”, “Adicionar ao pedido”,
“Continuar escolhendo”.

## 6. Práticas de implementação

- Conteúdo e funcionalidade continuam disponíveis sem animação ou imagem externa.
- Capas do catálogo demo são versionadas localmente e carregadas com lazy loading.
- Componentes preservam estados de loading, erro, vazio, hover, foco, ativo e indisponível.
- Ornamentos do cardápio ficam sob a classe `menu-shell`, evitando contaminar admin e landing.

## 7. Anti-padrões

- Não usar grade de cartões brancos com sombra e raio de 16 px.
- Não repetir a mesma seção horizontal para “AR”, “mais pedidos” e “promoções”.
- Não usar ícones ou formas abstratas sem função.
- Não substituir comida por fotos genéricas ou incorretas.
- Não usar laranja em grandes áreas; brasa é pontuação, não fundo.

## 8. Critério de decisão

Em conflito, priorizar: compreensão do prato → ação de pedido → confiança na imagem → expressão
de marca. Uma decoração que reduz legibilidade ou esconde preço deve ser removida.

## 9. Fluxo de trabalho

Auditar imagens e estados, implementar por superfície, validar em 375 px e desktop, testar busca,
navegação, detalhe, AR e carrinho, e revisar capturas reais antes de publicar.

## Decision Trace

1. **Renders locais em vez de fotos do Unsplash.** Garantem correspondência com cada produto e
   disponibilidade offline; custam menos realismo fotográfico que uma sessão profissional.
2. **Editorial de churrascaria em vez de e-commerce em cartões.** Combina com a marca e cria
   hierarquia; exige mais variação consciente entre módulos.
3. **Fundo de papel com blocos carvão.** Preserva leitura longa e dá contraste de marca; é menos
   minimalista que a interface anterior.
4. **AR como seção demonstrativa, não selo repetido dominante.** Explica o diferencial sem competir
   com preço e nome em todos os itens; alguns usuários notarão AR apenas após essa seção.
5. **Escopo no cardápio público.** É onde a capa dos produtos influencia decisão; o admin continua
   convencional para manter produtividade.
