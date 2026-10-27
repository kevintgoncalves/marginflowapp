# Brief – Revisão geral: limpeza do código e o que falta (27 out 2026)

Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`: não é uma reescrita. Faz-se em passos pequenos, cada um publicado e testado.

## A. Correções ao import livre do stocktake (testado com o Excel real do Kevin, 221 linhas)
Resultado de `parseFreeStocktakeImport`: **62% automático** (era 27%), 73 para rever, 12 sem match e as estimativas de prep (£490) lidas.
Mas algumas linhas automáticas estão **erradas no valor**, e são as mais perigosas porque ninguém as revê:
1. **A unidade da contagem não bate com a embalagem e mesmo assim é auto-confirmada:**
   - "baby carrots 6 punnets" → Carrots, Baby Rainbow (BOX £24.99) = £149.94;
   - "Focaccia Albion 3 loaf" → caixa de £54 = £162;
   - "Whole chicken 1 bx" → 1 frango de 900g.
   - Regra: se a unidade contada (punnet, loaf, bx, tray) não for a unidade da embalagem do produto, nunca confirmar automaticamente.
2. **Produto e receita com o mesmo nome:** "Pearl barley 5458 g" foi para a receita (cevada cozida) em vez do produto seco. No stocktake, preferir o produto quando há empate. Mostrar as duas opções.
3. **Embalagens "N x tamanho" da Elite ainda contadas como caixa inteira no stock:**
   - "Pine nuts 1.375 kg" → 0.229 packs, £6.09;
   - "Smoked applewood 750g, 2 uni" → £2.19 (devia ser cerca de £17.48);
   - "Stuffed vine leaves 2 kg" → £1.49;
   - também cayenne e canela.
   - Confirmar que a regra caixa/unidade do commit 759e859 também é usada aqui.
4. **Valores estranhos:** £149.94 de baby carrots e £162 de focaccia não foram marcados. O aviso deve comparar o valor da linha com a compra típica do produto.

## B. Limpeza do código (sim, vale a pena, em passos pequenos)
`src/main.jsx` tem 18 791 linhas; o total de `src` é cerca de 39 mil linhas, mais 70 ficheiros de teste.
1. **Código morto que dá para remover já, com testes:**
   - `SalesManager`: o import CSV antigo que criou os duplicados de junho. Hoje está atrás de `showSalesManager`, que nunca é true; ver também o render perto da linha 15626.
   - `src/domain/entitlements.js`: não é importado.
   - Verificar outros componentes e funções sem uso com uma ferramenta (por exemplo knip ou ts-prune) e listar ao Kevin antes de apagar.
2. **Código de recuperação de agosto:** `FinalRecoveryPanel`, `PendingRecoveryPanel`, `legacyRecovery*`, `emergencyRecovery`, `historicalInvoiceRecovery`, cerca de 221 referências em `main.jsx`.
   - Só remover depois de o Kevin confirmar que já não falta nada de agosto.
   - Antes disso, fazer um export final para um ficheiro.
3. **Duas fontes de verdade:**
   - O blob `marginflow_cloud_state` ainda tem `invoices` (471, de agosto) e `sales` (69), em paralelo com as tabelas relacionais.
   - Receitas, menus, stocktakes e waste só existem no blob; as tabelas `recipes` e `menu_items` estão vazias.
   - Decidir uma só fonte por módulo, com uma migração revista, sem apagar o blob antigo.
4. **Dividir o `main.jsx` por páginas**, uma página por PR: Dashboard, Invoices, Products, Stocktake, Waste, Recipes, Menu, Sales, Labour, Settings. Sem mudar comportamento, só mover código, e com os testes a passar em cada passo.
5. **Avisos permanentes no topo da app**, que aparecem a cada abertura há dias:
   - "31 reusable match or conversion update(s) await confirmation";
   - "Cloud records could not be verified; confirmed totals are unavailable".
   - Descobrir porquê (as 31 regras nunca são gravadas? que verificação falha?) e resolver, ou mostrar só quando há mesmo algo a fazer.

## C. O que falta para vender a outros restaurantes (até 31/12)
1. **Labour + service charge (Tarefa 3):**
   - A divisão BOH 40% / FOH 60% está fixa no código (`main.jsx` ~5428, ~5573, ~16178) e as % das Settings são ignoradas.
   - O Kevin tem um Excel "service charge" (horas, salário, SC/h por pessoa, report por cozinha/FOH) que vai mandar como modelo.
2. **Waste:** registo rápido no telemóvel, waste de receitas e de pratos com custo automático, relatório por motivo e por produto (ver `BRIEF-STOCK-WASTE-GP.md`, parte de usabilidade).
3. **Rate limit partilhado da IA das faturas:** o código diz que "a shared quota table is still a launch requirement".
4. **Backups:** confirmar o plano do Supabase de produção (backups diários). O projeto de staging foi pausado por inatividade.
5. **Velocidade:** a app abria em cerca de 7 s a 24/10; a meta era 2–3 s.

## Ordem sugerida
A (pequeno) → B1 e B5 (pequenos, menos ruído) → C1 Labour → B4 em paralelo, página a página → C2 → B2 e B3 com o Kevin → C3 e C4 antes do lançamento.
Explica o plano ao Kevin antes de cada passo.
