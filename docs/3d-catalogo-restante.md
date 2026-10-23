# Seis modelos restantes — contrato de qualidade

Referências semânticas: descrições e ingredientes do catálogo de demonstração.
Modelos estilizados, não digitalizações nem reproduções das fotografias comerciais.
Unidade: metro; GLB Y-up, origem centrada na base. Arquivos GLB e USDZ.
Limite por produto: 60 mil triângulos e 3 MB de GLB.

| Produto | Estrutura / características obrigatórias | Escala aproximada |
|---|---|---|
| Bolinho de costela | Seis croquetes dourados de superfície irregular, prato e maionese em ramequim | Prato 24 cm |
| Pizza quatro queijos | Disco, borda tostada, cobertura clara com manchas de queijos, pontos azuis de gorgonzola e fios de mel | 30 cm |
| Picanha na brasa | Três fatias com centro rosado, borda de gordura, marcas de grelha, farofa e vinagrete separado | Prato 28 cm |
| Pudim de leite | Flan individual anelar, corpo creme contínuo, cobertura e poça de caramelo, prato | Prato 18 cm |
| Suco natural | Copo com suco alaranjado, aro e base de vidro estilizado, rodela de laranja | Copo 15 cm |
| Água com gás | Garrafa de 500 ml com ombros, gargalo, tampa, rótulo neutro e rodela de limão | Garrafa 23 cm |

Vidro representado por superfícies azuladas claras, sem refração real; representação
compatível e legível na câmera, não promessa de vidro fotorrealista.

## Passes e validação

1. Estrutura: geometria hierárquica por ingrediente; render de cada modelo.
2. Acabamento: cores por vértice e rugosidade exportáveis; renders de quatro ângulos.
3. Normalização e exportação: medir GLB, validar orçamento, base e ZIP USDZ.
4. Aplicativo: carregar cada produto e seu GLB real, posicionar na câmera simulada,
   abrir ajuste, reposicionar e encerrar câmera. Revisar capturas do navegador.
5. Checks e build. Validação física e Quick Look requerem aparelho real.

Scripts: `scripts/blender-catalog-rest.py` e `scripts/finalize-blender-model.mjs`.

## Reprodução

No Python do Blender, definir `PROJECT_ROOT` com o caminho do repositório e
`PASS='structure'` ou `PASS='finish'`, depois executar o script de modelagem.
O passe final salva a cena editável em `artifacts/blender-catalog/catalogo-restante.blend`.
Para cada slug gerado, executar `node scripts/finalize-blender-model.mjs <slug>`.
Atualizar o cadastro com os bytes e medidas de `artifacts/model-validation/<slug>.json`.

`npm run check:models` confere os arquivos de todo o catálogo (incluindo os antigos).
`scripts/check-catalog-browser.py` percorre os produtos no servidor local da porta 5187.

O GLB preserva a variação por vértice. O USDZ usa a cor média de cada ingrediente:
o exportador Three.js não conecta cores por vértice ao shader do Quick Look.
Essa simplificação evita ingredientes brancos no iPhone; aparência nativa ainda
precisa ser conferida no aparelho.

## Resultado da integração — 23/10/2026

- 19/19 produtos com GLB e USDZ validados por `npm run check:models`:
  geometria finita, base no chão, medidas, bytes, limite de triângulos e alinhamento USDZ.
- Metadados dos 12 modelos antigos corrigidos no catálogo local e em `supabase/seed.sql`.
- 19/19 produtos aprovados no Chromium com câmera simulada: carregamento GLB,
  posicionamento, abertura do ajuste de escala, reposicionamento e encerramento das trilhas.
- Capturas dos seis novos itens inspecionadas; modelos visíveis e enquadrados.
  Evidências: `artifacts/catalog-browser/results.json` e PNGs na mesma pasta.
- `npm run check`: 75 testes aprovados e typecheck aprovado; lint com avisos existentes.
- `npm run build`: aprovado.

O teste aguarda dois frames após a orientação simulada antes de tocar na tela,
para que a matriz da câmera seja atualizada pelo renderizador.
Validação física de mesa e Quick Look nativo continua pendente de celular real.
Integração local; seed não aplicado ao banco remoto e versão não publicada.
