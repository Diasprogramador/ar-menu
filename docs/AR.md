# Realidade aumentada: decisões e implementação

Este documento registra por que a AR foi construída deste jeito. Ele existe para
que a próxima pessoa que mexer em `src/features/ar/` não redescubra sozinha as
armadilhas que já custaram tempo aqui.

---

## O problema real

A promessa do produto é *"você vê o prato do tamanho que ele é"*. Isso parece uma
questão de renderização, mas é uma questão de **unidades**.

Um arquivo GLB não diz "eu sou um hambúrguer de 12 cm". Ele traz uma malha e uma
caixa envolvente em unidades de cena. A especificação glTF 2.0 define que uma
unidade equivale a um metro — e boa parte dos exportadores ignora isso. Blender
exporta em metros; ZBrush, em unidades arbitrárias; marketplaces entregam modelos
em centímetros ou polegadas sem avisar.

Assumir "1 unidade = 1 metro" e seguir em frente é como um hambúrguer do tamanho
de um carro aparece na mesa do cliente.

---

## Quatro grandezas, mantidas separadas

`src/features/ar/scale.ts` nunca mistura:

| # | Grandeza | Origem | Unidade |
|---|---|---|---|
| 1 | Dimensões físicas reais | cadastro do restaurante | centímetros |
| 2 | Caixa envolvente do modelo | medida no GLB carregado | unidades de cena |
| 3 | Escala base calibrada | razão entre (1) e (2) | fator |
| 4 | Escala escolhida pelo cliente | gesto de pinça | multiplicador de (3) |

```
dimensão física (cm)
        ↓ cmToMeters
alvo em metros
        ↓ dividido pela caixa do modelo
escala base
        ↓ × scale_multiplier do cadastro
escala aplicada
        ↓ limitada a 0,5× – 2×
escala em tela
```

A escala é **uniforme**: um fator só para os três eixos. Ajustar cada eixo
independentemente faria o objeto caber na caixa declarada às custas de deformar o
prato. Entre os eixos informados, vence o **menor** fator, de modo que o objeto
caiba na caixa em vez de estourá-la.

Pratos redondos (pizza, açaí, sopa) usam `diameter_cm`, que governa os dois eixos
horizontais. O banco tem uma constraint que exige largura **ou** diâmetro, nunca
os dois: preencher ambos faria o cálculo escolher o eixo errado em silêncio.

### Detecção de unidade errada

Quando o fator resultante cai fora de `[0,02 ; 50]`, o cadastro quase certamente
está em outra unidade. Em vez de renderizar um objeto absurdo, `calibrateScale`
devolve um `warning`, que o painel mostra ao lado do preview — antes de a
configuração chegar ao cliente.

### Por que o zoom tem trava

A faixa liberada é `0,5×` a `2×` da escala calibrada, com um botão de voltar ao
1:1 que mostra a porcentagem atual. Pinça livre existiria por hábito de interface,
mas destruiria a única coisa que a AR aqui promete. O limite é derivado da
calibração, não uma constante: `minScale` e `maxScale` acompanham a escala base.

---

## Detecção de capacidades

`src/features/ar/capabilities.ts` é o **único** lugar do app que pergunta ao
navegador o que ele consegue fazer. Nenhum componente tem `if (isIOS)`.

Motivo: lista de user agent envelhece. O Safari passou anos sendo detectado por
regex e mudando de comportamento a cada versão; a Samsung Internet suporta WebXR
em alguns aparelhos e não em outros do mesmo ano. Feature detection responde pela
engine real.

O que é medido, cada coisa separada da outra:

- `window.isSecureContext` — WebXR e `getUserMedia` exigem HTTPS ou localhost;
- `navigator.xr.isSessionSupported('immersive-ar')` — a pergunta que importa;
- `document.createElement('a').relList.supports('ar')` — AR Quick Look do iOS;
- contexto WebGL — o visualizador 3D depende dele;
- `navigator.mediaDevices.getUserMedia` — existência da API, não a permissão.

O resultado é memoizado por sessão: não muda enquanto a aba está aberta.

### Da capacidade ao modo efetivo

`resolveARMode` combina o aparelho **com o produto**:

```
tem modelo e AR ligada?          ─não→  none
        │sim
WebXR imersivo?                  ─sim→  webxr
        │não
Quick Look E tem USDZ?           ─sim→  quick-look
        │não
câmera E https E WebGL?          ─sim→  camera
        │não
tem WebGL?                       ─sim→  viewer-3d
        │não
                                        none (ficha com fotos)
```

### O caminho universal

O degrau `camera` existe porque o WebXR, no Android, depende dos Serviços de RA
do Google estarem instalados — e uma parcela grande dos aparelhos não os tem. O
produto promete que basta escanear o QR Code, então não pode terminar em "vá à
loja e instale um aplicativo".

Ele usa apenas o que qualquer navegador oferece: `getUserMedia` para a imagem da
câmera, `deviceorientation` para a atitude do aparelho e WebGL para desenhar o
prato por cima. O modelo é ancorado num plano horizontal abaixo da câmera, e a
orientação do sensor mantém a cena estável enquanto a pessoa gira o celular.

**A escala continua real.** Conhecendo o campo de visão e a distância até o
plano, o tamanho em pixels de um objeto de dimensão física conhecida está
determinado. O navegador não expõe a distância focal da câmera, então assumimos
um campo de visão horizontal de 66° — a faixa em que quase todos os aparelhos
caem — e deixamos a altura do celular sobre a mesa num controle deslizante. O
cliente ajusta uma vez, olhando para a própria mesa, e o erro residual do campo
de visão é absorvido nesse gesto.

**O que ele não faz:** rastrear translação. Sem SLAM, o navegador não sabe que o
aparelho se deslocou, então caminhar em volta da mesa faz o prato derivar. A
interface diz isso em vez de deixar o cliente achar que quebrou. É também a
razão de este caminho ficar *abaixo* do WebXR e do Quick Look na ordem: onde há
rastreamento de verdade, usamos rastreamento de verdade.

### Falha recuperável não desce um degrau

Permissão de câmera negada não faz a interface cair para o visualizador 3D. É um
estado do qual o cliente pode sair — basta liberar a câmera no cadeado do
navegador — e descer automaticamente esconderia a instrução de como fazer isso.
A cascata só avança quando não há volta: sem câmera no aparelho, sem HTTPS, ou
modelo que não carrega.

O `E tem USDZ` não é detalhe. Um `<a rel="ar">` apontando para um `.glb` abre um
arquivo que o iOS não entende: tela em branco, sem erro. Sem USDZ, o iPhone vai
para o visualizador 3D — que continua mostrando as dimensões reais e o botão de
pedir.

### Duas armadilhas do Quick Look

**O link precisa ter um único filho, e esse filho é um `<img>`.** Com texto ao
lado da imagem, o WebKit trata o `<a rel="ar">` como download comum e a câmera
nunca abre — sem erro no console. Por isso o link é montado em código, com a
foto do prato como único filho, e clicado dentro do gesto do usuário.

**O arquivo precisa chegar como `model/vnd.usdz+zip`.** Servido como
`application/octet-stream`, o iOS baixa em vez de abrir. O cabeçalho está fixado
em `vercel.json`.

Além disso, o USDZ é gerado com `#allowsContentScaling=0` na URL: sem isso o
visualizador da Apple deixa o cliente redimensionar o objeto, o que anularia a
escala calibrada.

---

## Ciclo de vida da sessão

```
idle
 → checking          consulta capacidades
 → loading-model     baixa e prepara o GLB
 → requesting        pede a sessão XR (é aqui que a câmera é solicitada)
 → scanning          hit-test ativo, retículo procurando superfície
 → placed            prato apoiado; gestos de girar e escalar liberados
 → error             qualquer etapa acima, com mensagem e saída
```

**O modelo é carregado antes de pedir a câmera.** A ordem inversa levaria o
cliente a conceder acesso à câmera e só então descobrir que o arquivo não baixa —
a pior sequência possível para ele.

### Limpeza

Sair da AR precisa desligar: listeners da sessão, listeners de ponteiro do
overlay, `hitTestSource`, o loop de animação (`setAnimationLoop(null)`), o
`WebGLRenderer`, o elemento canvas e a própria `XRSession`.

Encerrar a `XRSession` é o que desliga o hardware da câmera. Um `WebGLRenderer`
esquecido vivo é o vazamento clássico de SPA com three.js: a GPU segue ocupada,
a bateria cai, e o segundo prato aberto na mesma sessão já sofre queda de FPS.

---

## Interação sobre a câmera

Com `dom-overlay`, o HTML que aparece por cima da câmera é o mesmo do modal — não
existe uma segunda árvore de componentes.

Dois cuidados que só aparecem em aparelho real:

**`beforexrselect`.** Sem cancelar esse evento nos botões, tocar em
"Reposicionar" também dispara o `select` da sessão XR, e o prato é plantado no
chão atrás do dedo. Todo controle da camada de câmera cancela o evento.

**`[data-ar-control]`.** Os gestos de girar e escalar são capturados no elemento
raiz do overlay. Sem marcar os controles, arrastar levemente o dedo ao tocar em um
botão giraria o prato.

Gestos disponíveis depois de posicionar:

| Gesto | Efeito |
|---|---|
| Arrastar com um dedo | gira no eixo vertical |
| Pinça com dois dedos | escala, limitada a 0,5×–2× |
| Botão reposicionar | volta ao modo de varredura |
| Botão de porcentagem | volta ao 1:1 |

---

## Modelos 3D de demonstração

`scripts/generate-demo-models.mjs` constrói os 12 GLB proceduralmente com
three.js e `GLTFExporter`, em vez de baixar assets prontos.

Motivo: o produto precisa de arquivos com **dimensão conhecida, origem previsível
e orientação certa**. Modelos de terceiros chegam com unidade arbitrária, pivô no
centro geométrico (ou em lugar nenhum) e às vezes Z-up. Cada um desses detalhes
quebra a escala 1:1 de um jeito diferente.

Convenções de todo modelo gerado:

- 1 unidade de cena = 1 metro;
- Y para cima;
- origem no centro da base — o modelo *apoia* em `y = 0`, o que faz o
  posicionamento no `hit-test` funcionar sem cálculo extra;
- aparência definida por cor de material e cor por vértice, sem nenhuma textura.

### Duas tentativas até a comida parecer comida

**Primeira versão: cilindros de cor chapada.** Forma certa, leitura errada — uma
superfície lisa e de cor uniforme devolve sempre o mesmo brilho, e o olho conclui
plástico.

**Segunda versão: perseguir fotorrealismo.** Ruído coerente deslocando todos os
vértices, textura procedural em cada peça, mapa de normais forte por toda parte.
Saiu pior que a primeira, e o dono do produto resumiu melhor do que qualquer
métrica: *"parece massinha de modelar"*.

O diagnóstico, olhando o render lado a lado com a foto do prato:

| Sintoma | Causa |
|---|---|
| Silhueta mole, sem aresta | 3 mm de ruído de baixa frequência em cima de peças de 12 cm |
| Superfície de barro | mapa de normais de ruído, com `normalScale` acima de 1,5 em tudo |
| Tudo com aparência do mesmo material | `roughness` entre 0,5 e 0,9 em toda peça, sem especular |
| Cor de lama | paleta dessaturada, depois comprimida de novo pelo tone mapping ACES |

O erro de fundo não era a execução: era o alvo. Modelagem procedural não alcança
pele de tomate nem miolo de pão, e **falhar tentando sai pior do que não
tentar** — é a definição do vale da estranheza.

### Terceira versão: ilustrada, não simulada

A direção atual não disputa com a fotografia; ela assume um desenho deliberado.
Três regras, em `acabamento.mjs` e `pratos.mjs`:

| Regra | Como aparece no código |
|---|---|
| Silhueta antes de superfície | perfis girados com aresta preservada; `ondular` no lugar de `deformar` |
| Cada comida com o seu brilho | tabela `ACABAMENTOS`: pão fosco, carne com sebo, queijo envernizado, tomate molhado |
| Sinal de identidade desenhado, nunca sorteado | borda rendada do smash, gergelim, alface saindo do pão, miolo claro do tomate |

`ondular` multiplica o raio por um seno de baixa frequência do ângulo. Diferente
do deslocamento por ruído, muda a silhueta **sem** comer a aresta: o pão fica
irregular como pão assado à mão, em vez de amassado. Somando três harmônicos —
7, 17 e 31 ondas — sai a franja rendada que identifica um hambúrguer prensado na
chapa.

Ruído sobrou em dois lugares onde o irregular *é* a identidade do alimento: a
farinha de rosca do anel de cebola e a casca rachada do brownie.

Consequência de projeto: sem textura nenhuma, o GLB do conjunto caiu de 5,2 MB
para 2,4 MB. Mapa de normais não deduplica entre materiais, então cada peça
pagava a sua cópia.

### O brilho depende de ter o que refletir

`clearcoat` é uma segunda camada especular por cima do material — exatamente o
que a gordura da carne, o verniz do queijo derretido e a água do tomate fazem na
vida real. Só que ele **precisa de um mapa de ambiente**: sem nada para
refletir, a peça chega fosca e a diferença entre pão e queijo desaparece.

O visualizador 3D já usava `RoomEnvironment`; as duas sessões de AR, não. Era
por isso que o prato parecia pior na câmera do que na tela de detalhe, mesmo
sendo o mesmo arquivo. Hoje as três cenas montam o mesmo ambiente, gerado em
memória — reflexo PBR crível sem baixar um HDRI e sem custo de rede no meio da
experiência. A textura é liberada no encerramento da sessão, junto com o resto.

A luz completa a conta: chave quente e rasante, que acende o especular;
contraluz fria, que separa a silhueta; preenchimento baixo, só para a sombra não
fechar em preto. A intensidade caiu junto com a mudança de paleta — com a luz
antiga, as cores novas chegavam na tela quase brancas.

### Medir a caixa envolvente com `precise`

`Box3.setFromObject(objeto)` transforma a caixa da geometria pela matriz do
objeto e devolve a caixa disso. Para uma peça rotacionada, o resultado é a
diagonal: uma folha de alface girada 0,9 rad inflava a largura declarada do
prato em 41%, e a calibração encolhia o modelo na mesa pelo mesmo fator.

O segundo argumento — `setFromObject(objeto, true)` — percorre os vértices de
verdade. Custa mais, roda uma vez por build, e é o que sustenta a promessa de
tamanho real.

### Lâmina com duas faces, porque o USDZ não aceita `DoubleSide`

Fatia de queijo, folha de alface e tira de bacon nascem de um plano, que só tem
uma face. A saída fácil seria `side: THREE.DoubleSide`, mas o USDZ não suporta
material de dupla face: no iPhone, essas peças sumiriam vistas por baixo — que é
justamente o ângulo de quem olha um prato na mesa.

`duasFaces` resolve na geometria: uma cópia deslocada para dentro pela
espessura, com as normais invertidas e o sentido dos triângulos trocado. Sai uma
casca sólida que funciona nos dois formatos e ainda sombreia melhor, porque
passa a ter volume.

### O teto desta abordagem

Os pratos são ilustrações tridimensionais com dimensão física correta. Não são
fotorrealistas, e nenhuma quantidade de ajuste procedural os tornará. Para
chegar em foto de verdade o caminho é substituir os arquivos por modelos
esculpidos ou por fotogrametria dos pratos reais — e a calibração já aceita
qualquer arquivo, porque `calibrateScale` normaliza qualquer unidade e
`prepareModel` recentraliza qualquer pivô.

Cada prato sai nos dois formatos na mesma execução: `.glb` para WebXR e para o
visualizador 3D, `.usdz` para o Quick Look do iPhone. O USDZ é exportado com
`quickLookCompatible` — o visualizador da Apple aceita um subconjunto menor de
materiais PBR — e com ancoragem declarada em plano horizontal, para o sistema
apoiar o prato na mesa em vez de tentar prendê-lo numa parede. Os 12 USDZ somam
7,3 MB, e só são baixados quando um cliente de iPhone abre a AR.

O formato exige que o zip não tenha compressão e que cada arquivo comece num
offset múltiplo de 64 bytes; o exportador do three.js cuida disso, e vale
conferir com um script antes de publicar, porque um USDZ desalinhado falha em
silêncio no aparelho.

Detalhe de execução: `GLTFExporter` usa `FileReader` para serializar o binário, e
o Node não tem essa API. O script faz a ponte para `blob.arrayBuffer()`.

---

## Carregamento e memória

`src/features/models3d/modelLoader.ts`:

- **Cache LRU de 3 modelos.** O mesmo prato costuma ser aberto em 3D e depois em
  AR na mesma sessão. Entradas expulsas têm geometria e textura liberadas.
- **Clone por uso.** O visualizador do painel e a sessão de AR podem estar vivos
  ao mesmo tempo. Clones compartilham geometria com o original — por isso quem
  descarta um clone **não** deve dispor desses recursos; isso é papel de
  `clearModelCache`.
- **Timeout de 25 s e `AbortSignal`.** Rede de restaurante cai; sair da tela
  precisa cancelar o download.
- **Erro não envenena o cache.** Uma falha remove a entrada, para que a próxima
  tentativa refaça a requisição.
- **Draco e Meshopt registrados.** Modelos comprimidos falhariam em silêncio sem
  os decodificadores.

O `prepareModel` recentraliza a caixa **depois** de aplicar escala e rotação — a
caixa envolvente muda com as duas, e centralizar antes deixa o objeto flutuando ou
enterrado na mesa.

---

## Estados de erro

Nenhum deles deixa a tela vazia. Todos mantêm o botão de adicionar ao pedido.

| Situação | O que o cliente vê |
|---|---|
| Sem HTTPS | "A realidade aumentada exige uma conexão segura." |
| Aparelho sem WebXR | Visualizador 3D com as dimensões reais |
| Permissão de câmera negada | Instrução para liberar no cadeado do navegador |
| Modelo não baixou | "Você ainda pode ver as fotos e as dimensões do prato." |
| Modelo inválido ou vazio | Mesma mensagem, com opção de tentar de novo |
| Sem detectar superfície | "Mova o celular devagar sobre a mesa" |
| Aparelho sem hit-test | Encerra a sessão e cai para o 3D, explicando |
| Sem WebGL | Ficha do prato com fotos |

---

## Privacidade

- A câmera é solicitada **apenas** quando o cliente toca em iniciar a AR.
- Nenhum quadro da câmera é lido, gravado ou enviado ao servidor. A sessão XR
  compõe a imagem no próprio aparelho.
- A sessão encerra ao sair da tela, o que desliga o hardware.
- Os eventos de analytics guardam nome do evento, produto e um identificador
  anônimo de sessão que vive no `sessionStorage` e some quando a aba fecha.

---

## Como validar uma mudança aqui

1. `npm test` — a matemática de escala tem 30 casos, incluindo modelo em
   centímetros, prato redondo, modelo degenerado e limites de pinça.
2. Abrir um produto no desktop: deve cair no visualizador 3D.
3. Abrir em Android com HTTPS: deve pedir câmera e mostrar o retículo.
4. Negar a permissão: deve mostrar a instrução, não uma tela preta.
5. Apontar `model_url` para uma URL inexistente: deve mostrar o erro de modelo.
6. Sair e reabrir a AR: a câmera precisa desligar entre as duas vezes.
7. `npm run build` — confirmar que `three` continua num chunk separado.
