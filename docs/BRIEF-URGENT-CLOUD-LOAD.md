# URGENTE – A app não carrega os dados da cloud ao abrir (27 out 2026)

Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`: **não limpar o localStorage do Kevin e não substituir nenhum módulo da cloud** por dados do browser.

## Sintoma
- O Kevin diz que "faltam coisas". Na app aparece 1 receita e 2 menus, mas na base de dados há 38 receitas e 4 menus:
  - `marginflow_cloud_state` recipes, revisão 33;
  - menus, revisão 50, com "October 2026 – Daytime" (20 pratos) e "October 2026 – Evening" (16).
- O aviso "Cloud records could not be verified; confirmed totals are unavailable" aparece **sempre** desde ~24/10, tal como "31 reusable match or conversion update(s) await confirmation".

## Causa (vista em produção a 27/10)
- O `loadCloudState` responde 200, mas o efeito de carregamento (`main.jsx` ~6305–6363) termina **sempre** com o erro:
  `"New invoice work arrived while loading. It has been retained. Retry cloud loading."`
  - Encontrei-o no estado React; o erro vem do `.catch` do `cloudError`.
- Ou seja, o `invoiceCommitGenerationRef.current` muda entre o início e o fim do carregamento em todas as aberturas, por isso `applyCloudSnapshot` nunca corre e `cloudReadyRef` fica `false`. Consequências:
  - receitas, menus, stocktakes, waste, settings e products vêm do **browser** (dados antigos), não da cloud;
  - `cloudReadyRef` false: **nada do que o Kevin altera nesses módulos é gravado na cloud** (~6414, ~6892);
  - o refresh relacional (~6374) não corre: `confirmedInvoicesLoaded` fica false e o aviso aparece;
  - provavelmente é também a razão de as 31 regras de learning nunca serem gravadas.
- Suspeita: algo na abertura incrementa a geração enquanto carrega, por exemplo o restauro do `invoiceBatch` do localStorage (571 KB) ou das 75 faturas locais. Confirmar com logs.

## Dados no browser do Kevin (para não perder nada)
- `invoices` locais: 75 (26/09–23/10), todas `synced/relational` e **todas existem na tabela `invoices`**.
- `recipes` local: 1 (a cloud tem 38). `menus` local: 2, um diferente da cloud (versão antiga do "Summer").
- Stocktakes, waste, suppliers, creditNotes, schedules: iguais aos da cloud.
- Settings diferentes da cloud: financial, company, menu, labour, invoice e ai. Comparar campo a campo e mostrar ao Kevin antes de escolher.

## O que fazer
1. Corrigir a corrida: a mudança de geração causada pelo próprio arranque não deve invalidar o carregamento. Se chegar trabalho novo de faturas durante o load, **juntá-lo** depois de aplicar o snapshot, em vez de abortar.
2. Se o load falhar, mostrar o erro real no aviso, e não só "could not be verified". Fazer retry automático uma vez.
3. Quando a cloud tem uma revisão mais recente do que a base local de um módulo, a cloud ganha. O que só existe localmente é juntado por id, como já faz `mergeArrayById`. Nunca deixar o browser apagar o que outra sessão ou outro dispositivo gravou.
4. Testes:
   - load com geração a mudar durante o arranque: o snapshot tem de ser aplicado;
   - cloud com 38 receitas e local com 1: ficam 38;
   - os saves só depois de `cloudReady`.
5. Depois de publicar, o Kevin abre a app e confirma que vê as 38 receitas e os menus de outubro, sem o aviso.
