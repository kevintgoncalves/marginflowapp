# Laboratório local fictício

Não ligar estas ferramentas a produção. Os runners recusam um API_URL diferente de `http://127.0.0.1:55431`. `fixtures.json`, `local-status.json`, dumps e logs ficam fora do Git, em `/private/tmp/marginflow-safety-lab`, com permissões privadas. Credenciais são geradas, nunca embutidas no código. Requer Docker, Supabase CLI, Node/npm e dependências instaladas do projeto.

## Retomar o laboratório existente

Usar HOME isolado para o CLI e sempre indicar `--workdir`; não executar comandos genéricos no projeto ligado a outro Supabase.

```sh
HOME=/private/tmp/marginflow-test-cli-home supabase --workdir /private/tmp/marginflow-safety-lab start --exclude studio,logflare,vector,edge-runtime,imgproxy
```

Capturar `supabase --workdir /private/tmp/marginflow-safety-lab status -o json` em `local-status.json`, com umask 077, sem imprimir as chaves. Confirmar o API_URL esperado. A configuração encontra-se em `config.toml`. Depois, na raiz do projeto:

```sh
node safety/lab/prepare.mjs
node safety/lab/proxy.mjs
```

Em terminais separados, `node safety/lab/serve.mjs` e `node safety/lab/serve.mjs --second`. Os endereços são 127.0.0.1:5187 e :5188. Para testar artefacto construído, executar `node safety/lab/build.mjs`, parar apenas esses dois servidores e arrancá-los com `--built` (e `--second` para a segunda sessão). Não servir `dist` da raiz: pode ter a configuração normal do projeto.

As contas fictícias existentes estão em `fixtures.json`. Não repetir o seed para “limpar” o teste. `seed.mjs` destina-se à primeira criação num laboratório novo; `--resume` apenas salta contas marcadas completas e não garante idempotência de cada etapa de uma conta parcialmente criada. Inspecionar e reconciliar qualquer falha antes de o repetir.

## Instalação nova: bloqueios conhecidos

Criar diretórios privados separados, copiar `config.toml` para `supabase/config.toml` e as migrações originais para `supabase/migrations`. A sequência completa falha na migração histórica `20260812120000_migrate_historical_sales_to_relational.sql`, que pressupõe dados específicos de produção. **Não copiar esses dados e não editar a migração original para conseguir um PASS.**

No ensaio documentado, apenas a cópia local dessa migração foi guardada em `not-applied/`, e o arranque com as outras 43 foi explicitamente classificado como fixture de schema parcial. `bootstrap-limitations.json` guarda essa limitação. Também foi necessário o GRANT local em `read-grant.sql` porque a sequência existente deixa a tabela de snapshots sem SELECT para authenticated. Estas adaptações são pré-requisitos do ensaio e não certificam o arranque completo nem constituem migrações propostas para produção.

Depois de resolver/admitir explicitamente essas limitações num novo laboratório, `prepare.mjs` e `seed.mjs` criam apenas dados fictícios por Auth/API/RPC. O primeiro seed deste ensaio usou uma estrutura inválida de stock; foi corrigida apenas nos fixtures sem apagar os registos. O script atual usa `lines`/`totalValue`.

## Falhas controladas e verificações

Escrever uma destas palavras em `/private/tmp/marginflow-safety-lab/network-mode`: `online`, `offline`, `fail-write`, `fail-reads`, `fail-snapshot`, `lost-ack`. Os modos afetam unicamente o proxy local. `lost-ack` encaminha o RPC de fatura mas suprime a resposta; não equivale a falha do commit no servidor. Restaurar sempre `online` ao terminar.

`verify.mjs` verifica as contagens esperadas **depois** dos passos de browser descritos no relatório; não é teste genérico de qualquer dataset. `inventory.sql` é apenas leitura e deve ser usado exclusivamente no contentor deste laboratório, com `psql -X -v ON_ERROR_STOP=1`, antes e depois da mudança de build. `attachment-rehearsal.mjs` cria dois novos buckets privados, copia um objeto fictício e compara SHA-256; não valida o vínculo de anexos da app.

O dump completo e as tentativas de restauro encontram-se descritos em `../../docs/SAFETY_ISOLATED_VALIDATION.md`. Não ignorar erros de restauro. O laboratório não constitui uma solução de backup para clientes.

## Encerrar preservando os dados

Parar apenas os processos dos runners deste laboratório. Depois:

```sh
HOME=/private/tmp/marginflow-test-cli-home supabase --workdir /private/tmp/marginflow-safety-lab stop
```

Não usar `--no-backup`, `db reset`, remoção de volumes, limpeza de browser ou remoção de tabelas. O CLI publica os serviços Docker em interfaces do host; mantê-los parados fora do ensaio. `/private/tmp` é temporário: o arquivo privado em `.marginflow-code-backups/isolated-validation-lab.tar.gz` conserva configuração, fixtures fictícios, dump e evidências desta execução, mas não os volumes Docker. Restauro integral do dump continua por comprovar.
