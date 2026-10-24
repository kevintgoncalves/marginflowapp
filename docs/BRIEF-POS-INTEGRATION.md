# Brief – Ligação aos POS (24 out 2026)

Fala com o Kevin em português. Fazer push para `main` publica na Vercel (app.marginflow.co.uk; ~2,5 min).
Antes de publicar correr `npm test`, `npm run safety:check` e `npx vite build`.
Uma migração nova precisa de:
- uma review em `safety/reviews/`;
- um teste em `supabase/tests/`;
- registo em `safety/reviewed-additive-migrations.json`.

As migrações em produção são aplicadas pelo Kevin, que cola o SQL no Supabase.

## Objetivo
Vendas automáticas para qualquer sistema de caixa. O Kevin só pode testar o Square (é a conta que tem).

## Arquitetura proposta
1. **Interface comum de adaptador:**
   - `listLocations()`
   - `fetchDailySales({ startDate, endDate })`, que devolve linhas normalizadas `{ date, category, grossSales, netSales, tax, discounts, refunds, serviceCharge, transactions }`.
   - O `serviceCharge` **inclui tips** (decisão do Kevin).
2. **Adaptador Square:**
   - OAuth oficial da Square.
   - Token guardado só no servidor (Vercel function + Supabase), nunca no browser.
   - API pública (Orders / Payments ou Reports).
   - Sincronização diária, voltando a ler os últimos 7 dias, porque o Square ajusta refunds e tips depois.
   - Escolha da location Square ↔ location MarginFlow.
3. **Adaptador CSV genérico** para todos os outros sistemas:
   - o utilizador faz upload do ficheiro;
   - diz uma vez que coluna é data / categoria / gross / net / IVA / service charge;
   - o mapeamento fica guardado num "POS profile" e é reutilizado no ficheiro seguinte.
4. **Mapeamento categoria → departamento nas Settings:**
   - Os departamentos são criados pelo utilizador; para a maioria serão algo como "Food" e "Wet".
   - Regra para categorias sem grupo (eventos/depósitos): % por departamento, ou "não alocado".
5. **Gravação:** usar o mesmo caminho do ecrã Input sales.
   - Uma entrada por dia, que substitui o dia (`persistRelationalSalesEntry` com `replaceDay`).
   - O "Other (no department)" é o que fica fora dos departamentos.
   - Ver `src/domain/salesWeekInput.js` e `src/lib/salesRepository.js`.
6. **Base de dados:** restrição única (company, location, sales_date) em `sales_entries`, numa migração revista. Confirmar primeiro que não há duplicados; a 24/10 não havia, eram 145 dias com 145 entradas.
7. **Ecrã:** estado da ligação ("Square ligado · última sincronização"), botão "Sincronizar agora" e registo de erros.

## Dados do Kevin (Square), para testar
- Reporting groups:
  - Drinks → Bar
  - Food - Bought in → Bought In
  - Food - Make in → Kitchen Made
  - categorias sem grupo (eventos, depósitos, itens sem categoria) → Other.
- Valores de referência já validados na base de dados para 01/06–23/10/2026:
  - net £839,551.97
  - service charge (com tips) £101,200.46
  - Uma sincronização correta deve dar estes totais.

## Por partes
Propor o plano ao Kevin primeiro (o que fica no servidor, o que ele tem de criar na Square Developer, por exemplo a app OAuth e o redirect URL) antes de escrever código.
