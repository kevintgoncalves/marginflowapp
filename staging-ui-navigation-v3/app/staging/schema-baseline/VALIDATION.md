# Validação do seed de staging — 15 setembro 2026

## Resultado atual

**PASS: fixture mínima de referências e onboarding fictício local, sem mudança de schema ou segurança.**

- Estado inicial: branch `staging/schema-baseline`, HEAD
  `9b091dfe2a5112fd8721e1917318a603fa475361`, árvore limpa.
- 44 migrações originais e os três SQL da baseline: conteúdo idêntico ao commit
  inicial, mesmos caminhos/SHA-256. `ui/unified-invoices` permanece em `84b36ad`.
- Seed fora da baseline/pasta de migrações, executado apenas por `seed-reference`.
- Referências: **plans 3, features 14, plan_features 28, internal_roles 4,
  internal_permissions 18, internal_role_permissions 41**; total **108**.
- Associações plano/feature: **basic 4, plus 10, pro 14**.
- Valores originais de SaaS 4A e restrição final de 4C: Support sem write.
  Nenhuma outra referência foi necessária; nenhuma conta interna criada.
- Conteúdo genérico comparado integralmente com as tabelas temporárias derivadas
  dos valores originais; não apenas verificação das contagens.

## Replay, idempotência e recusas

A baseline passou num laboratório novo sem seed. O seed foi aplicado duas vezes:
na segunda execução, **todas as linhas, UUIDs, timestamps e demais colunas** ficaram
iguais. O runner verifica essa propriedade em cada chamada a `seed-reference`.
Antes/depois do seed e dos testes, o hash normalizado de schema/ACLs permaneceu
`0026767d2d0e3f924605747c92d5da820f0736c6566e299a8153629dff1143b0`.

Zero empresas, locais, departamentos, fornecedores, produtos, vendas, faturas,
stocks, funcionários, utilizadores Auth e objetos Storage após validação.
Só subsiste a configuração do bucket vazio já criada pela baseline.

Testes negativos SQL: o seed recusou (1) nome de plano alterado,
(2) uma referência em falta e (3) um utilizador Auth fictício. Cada cenário decorreu
numa transação revertida; nenhuma referência persistente foi alterada.
As recusas não foram contornadas com UPDATE/DELETE, permissões ou flags de bypass.

## Onboarding e testes

`onboarding-test.sql` passou usando RPCs existentes sob o papel `authenticated`:

- Criação e retoma do mesmo workspace sem duplicar empresa/local.
- Pro trial inicialmente dormente; settings regionais persistidas.
- Recusa de conclusão sem departamentos; criação de um departamento fictício.
- Conclusão, estado `complete`, trial de **14 dias**, **14 features Pro** e write access.
- Segunda conclusão sem reiniciar o trial.
- Recusa de leitura/conclusão/alteração por outro utilizador e recusa sem autenticação.
- Roles de referência não tornam o cliente membro do staff interno.
- ROLLBACK de Auth, empresa, local, departamento, associação, subscrição e settings.

**306 testes existentes PASS; 11 testes do runner PASS; 3 testes negativos SQL PASS;
cloud-first/arquivo SQL PASS; safety:check PASS; build PASS.**
O build correu com o runner existente numa cópia sem `.env` e com localhost/placeholder.
Os testes anteriores de faturas/arquivo só mudaram para aceitar `pro` já presente
(`ON CONFLICT DO NOTHING`), mantendo as suas assertions.

O runner deixou de guardar outputs brutos do CLI porque podem conter credenciais
locais geradas. O log de arranque desta tarefa foi substituído por um resumo sem
segredos. Um teste cobre a ausência de outputs sensíveis nos logs de falha.

## Limites e reversão

Validação de base/RPC, não signup por email, login de browser ou E2E de toda a app.
Nenhum utilizador ou password é pré-criado pelo seed. Nenhum schema, grant, política,
trigger ou verificação de segurança foi alterado para fazer passar o onboarding.
Não houve acesso Supabase remoto, uso de credenciais reais, Vercel, push ou deploy.

O laboratório é descartável e foi destruído após a validação. Para reproduzir:
`create`, `seed-reference`, `verify`, `test_seed_refusals.py` e `destroy`, conforme README.
Reverter o commit do seed remove apenas esta extensão; não desfaz a baseline anterior.
Para obter apenas schema, basta recriar sem executar `seed-reference`.

---

# Histórico: validação da baseline em 9b091dfe

## Resultado

**PASS para instalação local temporária de schema. Não validado para produção ou Preview Branch remota.**

- Estado inicial confirmado: `ui/unified-invoices`,
  `84b36add6302deaa8f397d594fd3a8a5a40974ef`, árvore limpa.
- Trabalho isolado em `staging/schema-baseline`; ponteiro da branch original preservado.
- 44 caminhos e conteúdos originais iguais ao Git de origem e a
  `safety/migration-checksums.json`; SHA-256 registados no manifesto separado.
- Baseline exportada de uma base Supabase local nova, sem dados operacionais.
- Replay dos três ficheiros finais numa terceira base Supabase inteiramente nova:
  **PASS**, sem exclusões manuais durante esse replay, sem seed, sem flags que
  ignorem erros/health checks e sem alterar as migrações originais.
- Versões: CLI `2.108.0`, imagem PostgreSQL `15.8.1.085`. Extensões no manifesto,
  incluindo `pg_graphql 1.5.11`. Nenhuma ACL GraphQL foi importada.

## Comparação de schema

Referência: schema derivado das migrações originais sem os três ficheiros
exclusivamente históricos indicados no README, mais o contrato explícito de staging.
Foi comparado `pg_dump --schema-only` de `public`, `marginflow`, `auth`, `storage`.

| Verificação | Resultado |
| --- | --- |
| Definições, owners, ACLs e privilégios por omissão normalizados | Iguais; zero diferenças |
| Tabelas em public | 80 |
| Funções em public/marginflow | 68 |
| Índices em public | 366 |
| Constraints em public/marginflow | 511 |
| Triggers não internos em public/marginflow | 73 |
| Políticas em public/auth/storage | 298 |
| Referências literais de tabelas no código | 24/24 encontradas |
| Referências literais de RPCs no código | 33/33 encontradas |

`application-contract.json` lista as referências literais. Nomes dinâmicos não foram
resolvidos estaticamente; a igualdade integral com o schema de referência verifica
preservação dos objetos, não todos os caminhos funcionais possíveis da aplicação.

### Diferenças intencionais relativamente apenas aos originais

- Uma função de autorização do arquivo e oito políticas, adaptadas de
  `safety/proposals/invoice-original-archive.sql`, sem suporte ao antigo bucket do laboratório.
- Grants SELECT/INSERT em `invoice_files` e SELECT em `marginflow_cloud_state`,
  necessários aos módulos atuais de arquivo e leitura de snapshots.
- Configuração de um único bucket privado vazio; zero objetos Storage.
- Sem dados de referência permanentes nem dados operacionais. Os originais inserem
  3 planos, 14 features, 28 associações plano/feature, 4 roles internas,
  18 permissões e 41 associações role/permissão na base de derivação;
  **nenhum desses registos é exportado para a baseline**.
- História de instalação independente com três migrações; os 44 originais não são
  marcados como executados no laboratório de baseline.

A comparação inicial revelou grants herdados a mais após importar apenas o dump.
O artefacto `exact_source_acl.sql` corrigiu esse problema. Não foram removidos
privilégios já existentes na referência para esconder a diferença. Assim, certos
privilégios amplos dos originais continuam presentes: isto não constitui hardening
nem aprovação para expor a base com dados reais.

## Testes

- `npm test` através do prebuild existente: **306 pass, 0 fail**.
- `npm run safety:check` através do prebuild: **44 originais intactos, nenhuma
  migração nova na pasta original**.
- `npm run build`: **PASS** na cópia sem `.env`, com URL localhost e placeholder
  de chave sem valor de autenticação. Comando reproduzível: `python3 -B
  staging/schema-baseline/build.py`.
- Testes do runner: **6 pass** — contexto remoto, marcador de destruição,
  diretório existente, configuração ligada, ambiente sem credenciais e hashes.
- Teste SQL existente `cloud_first_invoice_completion.sql`: **PASS**. A cópia
  acrescenta apenas um plano `pro` fictício dentro da transação, necessário pelo
  trigger atual. Casos/assertions originais preservados; termina em ROLLBACK.
- Teste SQL adicional de arquivo: **PASS** para inserção/leitura do proprietário,
  recusa de leitura/escrita de outro utilizador, recusa de UPDATE de objeto e
  associação, presença de política restritiva de DELETE e grant de snapshots.
  Só cria metadados fictícios, sem bytes de ficheiros, e termina em ROLLBACK.
- Após cada suite SQL: **todas as tabelas da aplicação vazias**, zero utilizadores
  Auth, zero objetos Storage e schema inalterado.
- Comando `destroy --confirm-disposable`: **PASS** no laboratório final;
  remove apenas o laboratório marcado. Não foi usado `--all`.

## Limites e evidência

A primeira tentativa de build encontrou uma restrição de escrita no cache Vite.
O runner final mantém esse cache na cópia descartável e o build passou.
O teste SQL precisava do slug `pro`, conforme o trigger; a fixture foi corrigida,
sem alterar o schema. O Supabase bloqueia DELETE direto em Storage; não se
contornou esse mecanismo. A política DELETE foi inspecionada, não se realizou
uma chamada de eliminação pela API.

Não foram testados uploads/downloads de bytes pelo Storage API, todos os fluxos
E2E de browser, configuração remota, produção ou Vercel. As verificações não
certificam backup/restauro de dados reais. O onboarding de uma base apenas com
schema continua a precisar de referências fictícias explícitas e separadas.

As bases descartáveis foram eliminadas após validação. O runner permite repetir
a criação e os testes. Logs auxiliares privados permaneceram em
`/private/tmp/marginflow-schema-baseline-84b36ad-source` e
`/private/tmp/mf-schema-stage-84b36ad`; não foram versionados nem utilizados como
origem de dados. Não se contactou Supabase remota nem se fez push, merge ou deploy.
