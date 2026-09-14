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
python3 -B staging/schema-baseline/lab.py verify
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
Os logs ficam no diretório privado enquanto existir; guardar evidências antes de
destruir, se necessário. Para repetir o ensaio, destruir e executar `create`.
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

## Schema apenas: limite importante

Todas as tabelas da aplicação ficam vazias, incluindo `plans`, `features` e
permissões internas. Esses registos de configuração são **dados**, não schema.
Por isso a criação de uma empresa exige primeiro referências de plano fictícias:
o trigger atual requer um plano ativo com slug `pro`. O onboarding e as funcionalidades
não ficam prontos para uso humano apenas por instalar schema.

Os testes SQL acrescentam o mínimo de referências e entidades inteiramente
fictícias **dentro de transações terminadas com ROLLBACK**. Não existe seed
permanente nem importação de dados reais. Uma futura fixture funcional de staging
terá de ser explícita e separada; não enfraquecer o trigger para esconder essa dependência.

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
a nova linhagem tem três entradas, sem falsificar as 44 antigas.

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

O commit local pode ser revertido apenas na branch `staging/schema-baseline`,
sem tocar na branch original. Nenhum rollback de base existente é necessário.

Referências oficiais: [CLI local](https://supabase.com/docs/guides/local-development/cli/getting-started),
[referência CLI](https://supabase.com/docs/reference/cli/su),
[fluxo de migrações](https://supabase.com/docs/guides/local-development/database-migrations).
