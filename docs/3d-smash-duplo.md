# Smash Duplo Cheddar — modelo Blender

## Contrato de qualidade

- Referência semântica: descrição e ingredientes em `demoData.ts`. Modelo estilizado, não réplica fotogramétrica do prato real.
- Quatro discos de carne distintos, quatro fatias de cheddar com pontas caídas, molho e duas metades de brioche.
- Silhueta: pão arredondado, carne irregular e queijo fino; sem aparência de cilindros perfeitos empilhados.
- Dimensões aproximadas: 13 cm de largura, 13 cm de altura. Metros no GLB, Y para cima, base em zero.
- Materiais: pão dourado acetinado, carne marrom escura rugosa, cheddar alaranjado com brilho suave, molho creme.
- Hierarquia: raiz do produto e peças nomeadas por ingrediente/camada.
- Limite: 60 mil triângulos e 3 MB no GLB. Sem dependência de geradores pagos.

## Passes

1. Estrutura: pão, quatro carnes e quatro queijos; revisar proporção em múltiplos ângulos.
2. Acabamento: variações de superfície e cor, pequenas marcas tostadas e molho.
3. Exportação: GLB e USDZ, medidas reais do arquivo e inspeção no renderizador web.

## Reprodução

Executar `scripts/blender-smash-duplo.py` no Blender com `PROJECT_ROOT` apontando para o repositório e `PASS` igual a `structure` ou `finish`.
O script usa uma cena própria, preserva a cena anterior e grava somente os arquivos deste produto.

Depois da exportação Blender, executar:

```sh
node scripts/finalize-blender-model.mjs smash-duplo-cheddar
```

O finalizador junta os pequenos fragmentos de crosta, assenta a base em Y=0,
exporta o USDZ e verifica seu alinhamento e ausência de compressão.

## Resultado verificado

- 35.264 triângulos; GLB 1.165.352 bytes; USDZ 3.683.875 bytes.
- Dimensões medidas: 15,7 × 13,2 × 15,7 cm (incluindo as pontas do cheddar).
- Renders em quatro ângulos: `artifacts/blender-smash-duplo/finish-*.png`.
- Revisão visual frontal e traseira: quatro carnes, queijo entre camadas, base e coroa presentes. Acabamento estilizado; topo apresenta leve convergência radial da malha.
- Cena editável: `artifacts/blender-smash-duplo/smash-duplo-cheddar.blend`.
- GLB renderizado no aplicativo real: `artifacts/blender-smash-duplo/browser/camera.png`.
- Playwright com câmera simulada: posicionar, reposicionar, abrir ajuste e encerrar trilhas passaram. Sem erros JavaScript.
- `npm run check`: 75 testes aprovados; avisos de lint existentes.
- AR em mesa física e Quick Look em iPhone ainda precisam de validação no aparelho.
- Produto integrado ao catálogo de demonstração local; publicação não realizada.
