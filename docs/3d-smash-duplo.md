# Smash Duplo Cheddar no Blender

O cardápio do Brasa & Mesa descreve quatro discos de carne, cheddar entre as camadas, molho da casa e brioche. A montagem em `scripts/kitchen_burgers.py` segue essa receita. Cada disco tem um contorno próprio e recebe uma faixa contínua de textura ao redor da crosta. As pontas das fatias de queijo caem em direções diferentes.

## Reprodução

Na raiz do projeto, com as dependências instaladas e o Blender disponível, execute:

```sh
npm run gen:models -- smash-duplo-cheddar
npm run gen:covers -- smash-duplo-cheddar
npm run check:models
```

O primeiro comando grava a malha intermediária em `artifacts/blender-realistic/`. O finalizador aplica as texturas, ajusta a porção às dimensões cadastradas e gera GLB e USDZ em `public/demo-models/`. A capa em `public/demo/covers/` é renderizada a partir desse GLB. Para reconstruir todo o cardápio, omita o identificador nos dois comandos de geração.

## Medidas e verificação

O Duplo ocupa 16 × 13,8 × 16 cm (largura × altura × profundidade) e tem 22.896 triângulos. A origem fica no centro da base. O tamanho representa a porção de demonstração descrita no catálogo. O relatório gerado em `artifacts/model-validation/catalog.json` contém a medição de cada arquivo GLB. O teste de USDZ também confere o empacotamento usado pelo Quick Look.
