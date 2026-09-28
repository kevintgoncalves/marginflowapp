# Proposta de instalação limpa — NÃO APROVADA

As 44 migrações originais e os seus checksums permanecem intactos. Não atualizar o baseline de `safety:check` para fazer passar esta proposta. Nenhum ficheiro desta pasta é executado automaticamente nem está em `supabase/migrations`.

## Problema de ordenação

A migração `20260812120000_migrate_historical_sales_to_relational.sql` é uma operação de dados específica de uma empresa. Uma migração adicional posterior não pode resolver a falha que ocorre antes de chegar a ela. Inventar o cliente ou os 69 registos esperados numa instalação nova seria incorreto.

## Procedimento proposto reproduzível

1. Separar formalmente instalação de schema e operações históricas de dados. Preservar os 44 originais como arquivo imutável e o histórico dos ambientes existentes; não marcar a migração histórica como executada num cliente novo.
2. Produzir um **baseline de schema sem dados** para instalações novas a partir de um Supabase compatível. O baseline deve incluir tabelas, constraints, funções, triggers, RLS, grants, extensões e políticas personalizadas. A exportação suportada `supabase db dump --local` foi usada no ensaio de restauro; os dados são ficheiro separado. O baseline proposto precisa de revisão contra as definições dos 44 originais, incluindo qualquer DDL da migração histórica, e uma lista explícita das operações exclusivamente de dados.
3. Incorporar `snapshot-read-grant.sql` no baseline proposto; validar acesso autorizado e recusa entre empresas. Não depender de um GRANT manual após o arranque.
4. Guardar manifesto com SHA-256 de cada original, do baseline e da proposta de grant, versões exatas de CLI/PostgreSQL/extensões e decisão de revisão. Usar uma linhagem de instalação nova documentada, sem falsificar `supabase_migrations` dos ambientes antigos.
5. Para o cliente histórico existente, executar a operação original **apenas** num processo de migração de dados autorizado separado, com origem comprovada, backup e os seus preflight checks intactos. Se a empresa não existir, classificar a operação como não aplicável na linhagem nova; se existir mas os dados não corresponderem, abortar. Nunca substituir as verificações de totais por um sucesso vazio.
6. Num terceiro ambiente totalmente novo, aplicar apenas o baseline revisto, sem exclusões pontuais, seed, ajustes manuais ou dados de outro cliente. Executar a suite de instalação (schema/ACL/RLS), onboarding fictício, faturas, stocks, vendas e restauro. Só depois classificar instalação limpa como PASS.

## Estado concreto

A restauração executada nesta etapa comprova a recuperação de uma base já existente num novo Supabase compatível. **Não comprova uma instalação limpa a partir dos 44 ficheiros**: o laboratório de origem continua a ter a exclusão histórica declarada no relatório anterior.

Faltam o baseline de schema auditado e a decisão sobre a sua linhagem de migrações, a revisão da proposta de grant e uma execução integral do passo 6. Não foi aplicada migração nova nem alterado `safety:check`. Esta proposta evita apresentar a exclusão manual anterior como uma solução aprovada.

Foi preparado um candidato privado de schema e `clean-install-manifest.json` com os hashes dos 44 originais. O candidato não contém o dump de dados e já inclui o SELECT de snapshots. A auditoria encontrou também privilégios herdados, incluindo TRUNCATE para authenticated em snapshots; não foram retirados para maquilhar o restauro. A revisão de privilégios mínimos é obrigatória antes de adotar este candidato. O manifesto é evidência de proveniência, não autorização de instalação ou publicação.
