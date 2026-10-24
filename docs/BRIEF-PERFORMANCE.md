# Brief – Velocidade ao abrir a app (24 out 2026)

Medido em produção (app.marginflow.co.uk, Reading Room Brighton) a 24/10, abrindo a app de novo.

## Resultado
- A app só fica pronta ao fim de **cerca de 14 s**. O JavaScript e o CSS carregam em menos de 0,1 s. O tempo todo vai para a base de dados.
- **Gargalo principal:** a query de `invoices` demora **10,7 s**.
  - Faz `select ...,metadata,...` para 01/06–24/10, ou seja 1 041 faturas em 3 páginas de 500, uma de cada vez.
  - Mais de 97% do que é descarregado é `metadata.marginflow_snapshot`: **37 MB de JSON** (média de 9 KB por fatura, máximo de 66 KB).
  - As outras chaves de metadata são pequenas: `supplier_name` (20 kB) e `last_financial_header_repair` (58 kB).
- Arranque em cadeia: `auth` → `profiles` + `claim_internal_staff_invite` → `is_internal_staff` + `company_members`. Só aos ~3,6 s começam invoices e sales.
- `sales_entries` e `sales_department_lines` são pedidas **4 vezes cada** no arranque (aos ~3,6 s, 5,6 s, 9,7 s e 10,1 s).

## O que fazer (por ordem de ganho)
1. **Não trazer o snapshot na lista.**
   - A lista e o dashboard só precisam de cabeçalho e totais. Pedir só `metadata->supplier_name` (ou o join `suppliers(name)`), ou criar uma view ou RPC com as colunas leves.
   - Carregar o `marginflow_snapshot` e as linhas só quando o utilizador abre uma fatura ou quando um cálculo precisa mesmo das linhas.
   - Para o GP, preferir os totais por departamento calculados no servidor (view/RPC sobre `invoice_lines`) em vez de baixar todos os snapshots.
   - Ver `src/lib/invoiceRepository.js` (~linhas 60–100 e 344–350) e `src/domain/legacyRecoveryDiagnostics.js` (o diagnóstico de recuperação deve correr só a pedido).
2. **Pedir as páginas em paralelo** (ou com um `count` primeiro) em vez de uma a uma.
3. **Retirar as leituras repetidas de sales.** Ler uma vez e partilhar o resultado; ver os efeitos em `src/main.jsx` que voltam a carregar sales quando muda o período ou a comparação.
4. **Correr em paralelo os passos do arranque** que não dependem uns dos outros (`profiles`, `claim_internal_staff_invite`, `is_internal_staff`, `company_members`).
5. Opcional: mostrar o ecrã logo com o que já chegou (por exemplo sales e dashboard) enquanto as faturas carregam.

## Como verificar
- Abrir a app de novo e ver no DevTools → Network:
  - meta: menos de 2–3 s até ficar utilizável;
  - menos de 1 MB descarregado em invoices.
- Os totais do Dashboard (GP por departamento, net sales) têm de ficar **iguais** aos de antes. Comparar 01/06–23/10 antes e depois de publicar.
- Atenção às regras de segurança de dados do repositório: nada pode apagar nem reescrever faturas. Isto é só leitura.
