# Brief – Receitas fase 2 (26 out 2026)

O menu de outubro já está na app: 37 receitas e 36 pratos, ver o doc do projeto `receitas-menu-outubro-2026-10-26`.
Ao meter estes dados apareceram os pontos abaixo.
Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`: não alterar nem apagar receitas, menus ou produtos que já existam.

## 1. Rendimento total automático (pedido do Kevin)
- No editor de receitas, mostrar **"Peso total dos ingredientes: X kg / X l"**, a soma das linhas em g/kg/ml/l.
  - Assumir 1 ml = 1 g para somar, com o aviso "aprox.".
  - Linhas em "each", "pack" ou "portion" sem peso conhecido ficam de fora, e o ecrã diz quantas ficaram de fora.
- Botão **"Usar como rendimento"** e um campo opcional **"Perda na confeção %"** (reduzir, assar). O rendimento sugerido é o total × (1 − perda).
- O rendimento continua editável: o valor pesado depois de cozinhar é sempre o mais certo.

## 2. Preço usado no custo das receitas
- Hoje usa o preço da **última fatura** do produto.
- Nas Settings, adicionar a opção "Preço para custos de receitas":
  - **Média das últimas 4 semanas** (por defeito): média ponderada pela quantidade comprada. É o que se pagou de facto e é a mesma base do GP do Dashboard.
  - **Última fatura.**
  - **Mais barato entre fornecedores**: só para produtos ligados ou fundidos entre fornecedores. Mostrar o fornecedor.
- No ecrã, cada linha mostra a base: "£3.56/kg · média 4 semanas · TG Fruits".

## 3. Preços da Elite Fine Foods com "N x tamanho" errados (afeta tudo, não só receitas)
- Nas faturas da Elite o preço da linha é muitas vezes **por unidade interna** (lata, saco, tubo), mas o £/kg é calculado sobre a caixa inteira. Exemplos:
  - Applewood 8x750g £8.74 → £1.46/kg (real £11.65/kg);
  - Feta 6x900g £10.68 → £1.98/kg (real £11.87/kg);
  - Tomate 6x2.5kg £3.16 → £0.21/kg (real £1.26/kg).
- O mesmo acontece em prosciutto, paprika fumada, cider vinegar, brandy, açúcar, anchovas, nduja, ham, vine leaves, prawns, farfalle e satsumas.
- Noutros produtos o preço é mesmo da caixa: Arla 20x250g £22.78, waffles 42x55g £47.
- Proposta:
  - Detetar £/kg implausível para a categoria, ou usar a quantidade faturada versus a caixa.
  - Pedir confirmação "o preço é por caixa ou por unidade?" uma vez por produto e guardar a resposta no formato do fornecedor.
- Nos 55 produtos usados nas receitas já existe a `recipeConversion` correta. Usar isso como teste.

## 4. Embalagens que já são unidades e não são reconhecidas
- 229 de 609 produtos ativos estão sem £/kg.
- "KILO", "PER KG", "(PER KG)", "p/kg", "kg" e "SINGLE KG" devem dar 1 kg automaticamente.
- "SINGLE", "EACH" e "x1" devem dar 1 each.

## 5. Pequenos pontos
- Mostrar a `note` de cada linha de ingrediente (por exemplo "≈ 30g each (Kevin)"), que hoje fica guardada mas não aparece.
- Um prato em vários menus: os sides estão duplicados no menu de dia e no de noite. Avaliar "copiar prato para outro menu", ou pratos partilhados.

## Verificar
- Os custos e GPs do menu de outubro mudam só onde a regra de preço muda.
- Testes com os exemplos acima.
- `npm test`, `npm run safety:check`, `npx vite build`.
- Mostrar o plano ao Kevin antes de escrever código.
