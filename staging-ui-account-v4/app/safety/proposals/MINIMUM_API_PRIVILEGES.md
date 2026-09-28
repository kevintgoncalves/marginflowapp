# Proposta de privilégios mínimos — apenas ensaio local

Base: `1bd9e5e`. SQL: `minimum-api-privileges.sql`, deliberadamente fora de `supabase/migrations`. As 44 migrações originais permanecem intactas. Não é uma migração aprovada nem autorização de aplicação em produção.

## Origem e caminhos acessíveis

O bootstrap da plataforma atribuiu privilégios de tabelas/defaults a `anon` e `authenticated`, incluindo TRUNCATE, REFERENCES e TRIGGER. A migração `018_fix_company_bootstrap_rls.sql` acrescenta SELECT/INSERT/UPDATE/DELETE nas tabelas públicas existentes, sem revogar os privilégios excedentes. O restauro anterior repôs exatamente essas ACLs; isso comprovou fidelidade, não adequação.

`authenticated` é NOLOGIN no laboratório. O cliente normal recebe esse papel através do JWT/PostgREST, sem uma palavra-passe PostgreSQL para esse papel. Não foi encontrado um RPC de aplicação que execute TRUNCATE nem uma operação REST direta equivalente. O grant continua perigoso para qualquer caminho que consiga executar SQL nesse papel: TRUNCATE não fica limitado às linhas permitidas por RLS. No laboratório, SET LOCAL ROLE authenticated + TRUNCATE numa tabela fictícia com RLS funcionou antes da proposta; ROLLBACK preservou as duas linhas. Depois foi recusado por falta de permissão. Não se afirma que um simples pedido REST possa executar esse TRUNCATE.

Existe um caminho mais direto comprovado: UPDATE REST de `invoices.total_amount` pela própria empresa alterou o valor **sem incrementar sync_revision**. Os grants de escrita direta contornam o controlo de concorrência do RPC. Os RPCs v2/v2_legacy também estavam expostos ao papel autenticado. Estes caminhos têm de ser fechados de forma coordenada com os clientes suportados.

## Proposta e compatibilidade

- Retirar TRUNCATE/REFERENCES/TRIGGER de authenticated e privilégios de tabelas/sequências de anon/PUBLIC; manter SELECT de plans, sujeito à RLS existente (atualmente devolve zero linhas para anon).
- Retirar DML direto de invoices, invoice_lines e invoice_line_department_splits. Manter leituras autenticadas e escrita atómica pelo RPC v3 com revisão.
- Retirar EXECUTE público/autenticado de v2/v2_legacy. O v3 SECURITY DEFINER continua a invocá-los como proprietário.
- Retirar UPDATE de sequências e defaults excessivos dos criadores postgres/supabase_admin. Novas tabelas/sequências exigem grants explícitos revistos.
- Preservar todas as políticas RLS e o DML dos outros módulos. Vendas ainda usam DML direto no repositório; a proposta não finge uma auditoria completa das restantes funções, papéis de negócio ou service_role.

Antes de adotar: inventariar versões/integrações que ainda usam DML direto ou v2, fazer revisão das funções SECURITY DEFINER/search_path e dos papéis por módulo, validar onboarding e vendas/stock em toda a matriz funcional, integrar o SQL num procedimento de release revisto e preparar ACLs anteriores para reversão controlada. Não voltar a conceder permissões silenciosamente para compatibilizar um cliente antigo. Nunca restaurar dados como undo de uma alteração de grants.

## Ensaio reproduzível e evidência

Destino novo `marginflow-permissions-lab`, API 55631 / DB 55632; duas contas e dados inteiramente fictícios. O schema e ACLs vieram do candidato local já preservado, sem importar o dump de dados. O Supabase compatível preparou roles/extensões. Foram acrescentadas referências de plano/funcionalidades fictícias e executado o seed local adaptado. Uma primeira tentativa sem essas referências falhou; a conta órfã fictícia ficou preservada e os dois utilizadores completos usam outros identificadores. **Este arranque não valida a instalação limpa.**

Ordem do ensaio, num destino novo com essas fixtures e a mesma versão do schema:

1. Guardar inventário/ACLs; executar `node safety/lab/permission-api-test.mjs --before` para demonstrar o bypass numa fatura de prova criada para isso.
2. Executar o probe TRUNCATE com SET LOCAL ROLE numa transação que termina em ROLLBACK, apenas na tabela descartável `safety_privilege_probe` com duas linhas fictícias.
3. Aplicar `minimum-api-privileges.sql` com `psql -v ON_ERROR_STOP=1` exclusivamente nesse destino.
4. Executar `node safety/lab/permission-api-test.mjs --after` e repetir o probe SQL esperando permission denied. Criar uma tabela de prova em transação e verificar que os defaults não concedem TRUNCATE/INSERT a authenticated nem SELECT a anon; ROLLBACK.
5. Verificar browser e conservar logs, ACLs e fixtures privadamente. Não executar os scripts de seed sobre um ambiente com clientes.

**PASS depois da proposta:** leitura própria, gravação v3 com incremento de revisão, escrita própria de produto; **recusas PASS:** DML direto de faturas, RPC v2, leitura/escrita entre empresas, leitura anónima de faturas, TRUNCATE e defaults de novas tabelas. O teste API corrigiu duas expectativas do próprio teste: plans já não tinha política anónima e repetir um payload idêntico é idempotente; a tentativa seguinte alterou realmente o custo para testar incremento. Nenhuma política/verificação foi relaxada.

Logs privados: `permissions-evidence.json`, `permission-probe.json`, `permissions-truncate-before.log`, inventários antes/depois e exportações do laboratório. Não incluir fixtures, credenciais, backups ou dados em commits.

**Limites:** a validação cobre os caminhos indicados, não certifica autorização completa por perfil nem onboarding comercial. A proposta não valida consistência contabilística de payloads arbitrários: o probe que alterou o cabeçalho deixou inicialmente diferenças entre total documental e soma das linhas. Os relatórios usam linhas; a validação servidor de totais/metadados continua a exigir auditoria. Permissões de produção não foram consultadas ou alteradas.
