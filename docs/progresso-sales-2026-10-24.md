# Sales (Square) – estado a 24 out 2026

## Fonte
- Square Dashboard → Reports → Category Sales. O service charge vem do Sales summary, linha "Tips and service charges".
- **O service charge inclui as tips** (decisão do Kevin).
- Reporting groups:
  - Drinks → Bar
  - Food - Bought in → Bought In
  - Food - Make in → Kitchen Made
  - Sem grupo ("Other Categories"): eventos, depósitos e itens sem categoria.
- Convenção:
  - O total do dia é o net do Square **com** Other.
  - Os eventos que o Kevin dividiu à mão mantêm a divisão: 09/06 e 08/09.
  - O resto do Other fica no total, na coluna "Other (no department)".

## Estado dos dados (verificado na base de dados)
- 01/06 a 23/10: 145 dias, 145 entradas, sem duplicados.
- Net £839,551.97, igual ao Square (1p de arredondamento a 25/08).
- Service charge total £101,200.46, igual ao Square com tips.
- **Uma sincronização correta pelo adaptador Square deve dar estes mesmos totais.**

## Código publicado (main)
- `78ac985` – uma entrada por dia (`persistRelationalSalesEntry` com `replaceDay`).
- `f8e35ef` – cada gravação já não reescreve todos os dias carregados.
- `14fc9b4` – novo "Input sales": grelha semanal (`src/domain/salesWeekInput.js`). Tem Gross e Net por departamento, Other e service charge, e aceita colar um bloco de uma folha de cálculo.
- `0ef0cfb` – a grelha já não transforma uma diferença só no gross em vendas net.

## Próximo
- Ligação aos POS: Square primeiro; para os outros sistemas, import CSV com mapeamento de colunas (ver `BRIEF-POS-INTEGRATION.md`).
- Service charge no labour: depois.
- Divisão de trabalho: desenvolvimento → Claude Code; dados e testes em produção → sessão de gestão do Kevin.
