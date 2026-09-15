# Baseline de staging — exclusivamente temporária, nunca produção

Origem: `84b36add6302deaa8f397d594fd3a8a5a40974ef`, branch original
`ui/unified-invoices`. Esta estrutura tem uma **linhagem de instalação independente**.
Não substituir `supabase/migrations`, não copiar estes ficheiros para essa pasta e
não marcar as migrações históricas como executadas. Os 44 originais permanecem
nos mesmos caminhos, byte por byte; `manifest.json` regista os SHA-256.

## Criar, verificar e destruir

Executar na raiz de **MarginFlow work edition**, com Python 3, Docker local e
Supabase CLI **2.108.0**. O Docker deve usar um socket Unix local. Não usar um
contexto remoto. O CLI deve ter as imagens locais compatíveis; a versão de
PostgreSQL validada é `public.ecr.aws/supabase/postgres:15.8.1.085`.

```sh
python3 -B staging/schema-baseline/test_lab.py
python3 -B staging/schema-baseline/lab.py create
python3 -B staging/schema-baseline/lab.py seed-reference
python3 -B staging/schema-baseline/lab.py verify
python3 -B staging/schema-baseline/test_seed_refusals.py
python3 -B staging/schema-baseline/build.py
```

O runner cria exclusivamente `/tmp/marginflow-schema-baseline-lab-84b36ad`
(`/private/tmp/...` no macOS), com identidade `mf-schema-baseline-84b36ad`.
Recusa diretório/recursos existentes, alterações nos hashes, configuração ligada,
versão diferente do CLI e contexto Docker remoto. Não recebe URL, password,
project ref ou destino arbitrário. Os subprocessos não herdam credenciais de API,
PostgreSQL ou Supabase. Os ficheiros `.env` não são copiados.

Comando Supabase executado internamente:

```sh
supabase --workdir /tmp/marginflow-schema-baseline-lab-84b36ad start --exclude studio,logflare,vector,edge-runtime,imgproxy
```

API local: `http://127.0.0.1:55931`; PostgreSQL: porta `55932`;
shadow: `55930`; mailpit: `55934–55936`. Não partilhar as chaves locais.
O CLI pode publicar portas em todas as interfaces do host: manter este laboratório
num computador/rede de desenvolvimento privada e destruí-lo quando terminar.

**Destruição expressamente limitada ao laboratório fictício acima:**

```sh
python3 -B staging/schema-baseline/lab.py destroy --confirm-disposable
```

O runner verifica o marcador e a configuração antes de executar:

```sh
supabase --workdir /tmp/marginflow-schema-baseline-lab-84b36ad stop --project-id mf-schema-baseline-84b36ad --no-backup
```

Depois remove apenas o diretório marcado. Este comando apaga os volumes/dados
fictícios desse laboratório. Não usa `--all`, `db reset` nem remove outros projetos.
Os logs guardam apenas resumos sem outputs brutos do CLI, que podem conter chaves
locais geradas. Não se guardam passwords, tokens ou service-role keys nos artefactos
ou nos logs do runner. Para repetir o ensaio, destruir e executar `create`.
A baseline é para uma instalação nova, não para reaplicação sobre schema existente.

## O que é instalado

1. `20260915000000_schema_baseline.sql`: exportação **sem dados** de `public` e
   `marginflow`, incluindo objetos, funções, índices, constraints, triggers, RLS,
   comentários e ownership. As RPCs de recuperação chamadas pela aplicação são
   preservadas como definições; nenhuma recuperação é invocada durante a instalação.
2. `20260915000001_exact_source_acl.sql`: repõe as ACLs efetivas da referência.
   Um dump simples não revoga todos os grants que o bootstrap atribui a tabelas
   novas. A comparação inicial revelou esse problema, incluindo TRUNCATE nos
   arquivos; esta etapa remove esses grants adicionais sem alargar os da origem.
3. `20260915000002_staging_application_contract.sql`: adaptação explícita das
   propostas locais de arquivo de originais e leitura de snapshots. Acrescenta a
   função `can_invoice_original_scope`, quatro políticas Storage e quatro políticas
   de associação em `invoice_files`, e grants SELECT/INSERT necessários.
   Cria somente a **configuração de um bucket privado vazio**
   `marginflow-invoice-originals`; não cria ficheiros ou metadados de objetos.
   A compatibilidade com o antigo bucket fictício `safety-invoice-attachments`
   foi deliberadamente excluída.

Auth, Storage, roles e extensões geridas são inicializados pelo Supabase local.
Não se copia uma definição parcial de `graphql_public.graphql` nem ACLs dessa
função. Não se usam `--no-acl`, desativação de triggers ou permissões de produção.

## Seed de referências separado e explícito

`create` continua a instalar **somente schema**, com seed automático desativado.
`reference-seed.sql` fica fora de `supabase/migrations` e nunca é copiado para essa
pasta. Aplicá-lo apenas pelo comando explícito `lab.py seed-reference` acima.

| Tabela | Contagem exata |
| --- | ---: |
| plans | 3 |
| features | 14 |
| plan_features | 28 |
| internal_roles | 4 |
| internal_permissions | 18 |
| internal_role_permissions | 41 |

Os planos são `basic`, `plus`, `pro`, com 4/10/14 features respetivamente. Nomes,
descrições, chaves e associações vêm dos INSERTs genéricos da migração SaaS 4A.
O estado final aplica a restrição de 4C: Support tem leitura, sem associação a
`support.workspace_write`. Essa permissão continua definida e disponível ao
Super Admin conforme o original. Nenhuma conta interna ou acesso de utilizador
é criado. Preços, limites e outros campos não configurados mantêm os defaults
do schema; não são inventados valores comerciais.

São apenas 108 linhas de configuração. Não há empresas, locais, departamentos,
produtos, fornecedores, trabalhadores, vendas, faturas, stocks, utilizadores Auth
ou objetos Storage. Nenhuma outra referência foi necessária ao onboarding.

### Segurança e idempotência

O runner verifica identidade local, marcador, configuração, schema e hashes antes
do seed. O SQL exige sinalização de sessão do runner, serializa execuções e bloqueia
as tabelas durante a verificação/aplicação. Essa sinalização não é uma credencial
nem torna seguro copiar manualmente o SQL para outro destino.

Os dados esperados são construídos em tabelas **temporárias**, usando os valores
originais. O seed aceita apenas referências totalmente vazias ou o estado exato
já esperado. Uma referência parcial, adicional ou alterada, ou qualquer dado
operacional/utilizador/objeto, causa erro e rollback. Não atualiza nem apaga
referências persistentes para as forçar a coincidir. Helpers temporários desaparecem
quando termina a sessão; nenhum objeto persistente de schema é criado.

Cada `seed-reference` aplica o seed e repete-o, comparando todas as colunas,
incluindo UUIDs e timestamps. A segunda aplicação não escreve linhas persistentes.
`verify` reconhece automaticamente baseline vazia ou fixture completa, compara os
valores e contagens exatos, executa testes transacionais e confirma novamente a
ausência de dados operacionais e alterações às referências/schema.

Os testes de faturas/arquivo aceitam o plano `pro` já existente; quando executados
sobre a baseline sem seed, criam-no apenas dentro da transação de teste.
`onboarding-test.sql` usa identidades `example.test` sem passwords/tokens, assume
`authenticated` para chamar as RPCs atuais e termina em ROLLBACK. Valida criação,
retoma, settings, departamento, conclusão, trial Pro de 14 dias, entitlements e
recusa a outro utilizador/sem autenticação. Não testa signup por email nem browser.

Após estes comandos o ambiente tem as referências necessárias para iniciar um
onboarding fictício, **mas nenhuma conta de acesso pré-criada**. A utilização humana
subsequente deve criar apenas contas/dados fictícios. Depois de existirem dados
operacionais, o seed e esta verificação de fixture vazia recusam execução; não são
ferramentas de reconciliação nem manutenção de uma base em uso.

## Proveniência e comparação

Uma base Supabase nova foi usada exclusivamente para derivação. Foram aplicadas
cópias intactas de 41 migrações, sem seed. Ficaram fora dessa derivação:

- `20260812120000_migrate_historical_sales_to_relational.sql`: verificações e
  operações DML específicas de um cliente; não contém DDL necessário ao schema.
- `20260810222000_restore_safe_historical_invoices.sql` e
  `20260810223000_prepare_and_retry_safe_historical_invoices.sql`: marcadores
  históricos cujo SQL executável é apenas `SELECT 1`.

As restantes operações DML das cópias de derivação não entram na exportação.
A base de derivação não recebeu empresas, utilizadores ou dados operacionais.
O dump foi gerado com o comando suportado abaixo. Apenas as linhas vazias finais
foram normalizadas no artefacto; os hashes da exportação bruta e da baseline
estão no manifesto:

```sh
supabase --workdir /private/tmp/marginflow-schema-baseline-84b36ad-source db dump --local --schema public,marginflow --file /private/tmp/marginflow-schema-baseline-84b36ad-source/schema.sql
```

Este é o comando de proveniência, não um requisito para criar o laboratório com os
artefactos já gerados. A referência esperada corresponde ao schema das 41 migrações
mais o contrato de staging descrito acima. `manifest.json` regista o hash de um
`pg_dump --schema-only` de `public`, `marginflow`, `auth`, `storage` dessa referência.
A comparação ignora apenas comentários de cabeçalho, linhas vazias, tokens aleatórios
de restrição do dump e ordem de comandos GRANT/REVOKE. Preserva definições, owners,
ACLs e privilégios por omissão. A história de migrações é intencionalmente diferente:
a nova linhagem tem três entradas, sem falsificar as 44 antigas. O seed de dados
não acrescenta uma entrada ao histórico de migrações.

Não regenerar hashes para aceitar diferenças. Mudanças no código da aplicação,
CLI, PostgreSQL, Auth ou Storage exigem nova derivação e revisão. Ver `VALIDATION.md`.

## Escolha de ambiente e reversão

Usar esta estrutura num **laboratório local ou projeto temporário independente**,
inicializado explicitamente com esta linhagem. Não está validada para produção.
Os privilégios amplos herdados dos originais são preservados; isto não é uma
certificação de segurança nem substitui a revisão de privilégios já documentada.

Não recomendar uma Preview Branch do projeto atual com o fluxo Git habitual:
ela continuaria a ler `supabase/migrations` e a falhar na operação histórica.
`--workdir` é uma opção do CLI local, não uma configuração comprovada do workflow
remoto de Preview Branches. Não foi criada nem contactada nenhuma branch remota.

Para abandonar esta solução: destruir o laboratório com o comando acima e voltar
à branch original, se a árvore estiver limpa:

```sh
git switch ui/unified-invoices
```

O commit local do seed pode ser revertido com `git revert <commit-do-seed>` apenas
na branch `staging/schema-baseline`, depois de destruir o laboratório. Isso preserva
o commit da baseline. Para voltar à baseline vazia sem reverter código: destruir
e executar somente `create`, sem `seed-reference`. Nenhum rollback de base existente é necessário.

Referências oficiais: [CLI local](https://supabase.com/docs/guides/local-development/cli/getting-started),
[referência CLI](https://supabase.com/docs/reference/cli/su),
[fluxo de migrações](https://supabase.com/docs/guides/local-development/database-migrations).
