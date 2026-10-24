# Brief – Stocktake, Waste e GP ajustado ao stock (revisão de 24 out 2026)

Revisto em produção (conta do Kevin, Reading Room Brighton) e no código:
- `src/main.jsx`: `metricsForPeriod` ~3766, `latestStocktakeValue`/`openingStockValue` ~3710, `Stocktake` ~13928, `Waste` ~14913;
- `src/components/stocktake/LiveStocktakeEntry.jsx`.

Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`: os stocktakes e o waste que existem não podem ser alterados nem perdidos.

## Dados em produção (blob `marginflow_cloud_state`)
- Stocktakes (os dois do Kitchen Made):
  - 13/04/2026: "Opening Stock", valor manual £3,796.31.
  - 03/08/2026: contagem de 229 linhas, £4,137.96. Inclui produtos do Bar (£61.45) e do Bought In (£11.85) contados dentro do stocktake do Kitchen Made.
- Waste: 2 registos de junho, croissants £6.96 e "Hake garnish" £18.40 (custo escrito à mão).

## Erros de cálculo (os mais importantes)
1. **O stock de abertura e o de fecho vêm do mesmo registo.**
   - `openingStockValue()` e `latestStocktakeValue()` usam os dois o stocktake mais recente com data ≤ fim do período.
   - Um stocktake de fecho tem `openingStockValue = 0`, por isso a abertura fica quase sempre a 0.
   - Também não verificam se o stocktake está dentro do período. Para 01/06–24/10, a app usa o de 03/08 como fecho e 0 como abertura.
   - Resultado: custo = compras − £4,137.96, e o GP ajustado ao stock sai inflacionado.
   - **Regra certa:**
     - abertura = o valor contado na data de início do período, ou na última contagem antes dela;
     - fecho = o valor contado na data de fim;
     - custo = abertura + compras (entre as duas datas) − fecho.
   - Se não houver as duas contagens à volta do período, mostrar "Sem stocktake de abertura/fecho" e **não** calcular o GP de stock.
   - Melhor ainda, o GP de stock deve ser calculado **entre stocktakes** (por exemplo 13/04 → 03/08) e não num período qualquer.
2. **O waste é contado duas vezes.**
   - `realCostIncludingWaste = stocktakeCost + waste`. Mas o produto deitado fora já foi comprado e já não está no stock de fecho, por isso já faz parte do custo de stock.
   - O waste deve aparecer como **parte do custo**, por exemplo "do custo de £X, £Y foi waste (Z% das vendas)", e não ser somado outra vez.
   - Junto do GP por faturas pode aparecer como informação, mas nunca somado ao custo de stock.
3. **O "Waste cost" diz "This month", mas soma todo o waste de sempre.** A página não filtra por datas. Tem de usar o período escolhido.
4. **O "Variance vs theoretical" e a coluna "Variance" são sempre "–"**: não estão implementados. Ou se implementa o teórico (vendas por prato × receitas, quando houver menu e receitas) ou se escondem até lá.
5. Um stocktake tem um departamento só, mas pode ter linhas de outros departamentos. O valor deve ser dividido pelo departamento de cada produto, para o GP por departamento.

## Usabilidade (testado no telemóvel)
**Stocktake:**
- A contagem ao vivo está razoável: pesquisa, filtro por departamento, "Select".
- Mas depois de escolher um produto, o campo Quantity aparece **por baixo da lista** e atrás dos 3 botões fixos (Close / Save Progress / Review & Finalise), que ocupam ~⅓ do ecrã. O campo de quantidade deve abrir logo junto ao produto, ou numa folha por baixo, com o teclado numérico.
- A contagem é em embalagens de compra: "8 x 2.5LTR" conta em caixas de 8. Meia garrafa tem de ser 0.0625.
  - Deve dar para contar na unidade natural (garrafa, kg, each) e converter com o conteúdo por embalagem que o produto já tem.
- Seria útil uma "lista de contagem" pela ordem das prateleiras: câmara frigorífica, seco, bar. Pode ser guardada e repetida todas as semanas.

**Waste:**
- Hoje o registo é produto + quantidade + "Unit cost", com o preço da embalagem.
- Para o staff, o rápido é: escolher produto, receita **ou prato** → quantidade e unidade (g, kg, each, porção) → motivo. Ficou feito.
- O custo é calculado (£/kg da última fatura, ou o custo da receita/prato), e não escrito à mão. "Hake garnish" devia ser uma receita.
- Botão "Add waste" grande no telemóvel, que abre logo o teclado e lembra o último motivo.
- Relatório por motivo e por produto (top 10), no período escolhido.

## Como verificar
- Testes unitários de `metricsForPeriod`, com os dados reais em forma de teste:
  - abertura 13/04 £3,796.31, fecho 03/08 £4,137.96, compras X → custo = 3,796.31 + X − 4,137.96;
  - período sem stocktake de fecho → "não disponível", nunca 0;
  - o waste não muda o custo de stock.
- O Dashboard deixa de mostrar GP de stock / "Real GP incl. waste" acima de 100% ou com compras a 0.
- Fazer uma contagem no telemóvel sem scroll para encontrar o campo da quantidade.
- `npm test`, `npm run safety:check`, `npx vite build`. Mostrar ao Kevin antes de publicar.

## Ordem sugerida
Fazer primeiro os erros de cálculo 1–3, que são pequenos e mudam números que o Kevin vê. Depois a usabilidade.
O waste por receita/prato depende do novo modelo de receitas (`BRIEF-RECIPES-MENU.md`).
