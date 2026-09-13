# Validação isolada — 13 setembro 2026

Estado: **não autorizado para publicação**. Branch `safety/phase-1`; base desta continuação `737f769`. Não houve push, merge, deploy, ligação à produção nem alteração de dados reais.

## Preservação e alterações

O pacote Phase 1 já estava integrado em `737f769`; ver `SAFETY_PHASE_1_INTEGRATION.md`. Esta continuação preserva essa integração e as 44 migrações originais. Foram feitas cópias recuperáveis privadas em `.marginflow-code-backups/`: a cópia anterior à integração e `browser-validation-737f769.tar.gz`. São cópias de código, **não backups da base de dados dos clientes**.

Corrigido após reprodução no browser:

- O cache global mostrava produtos da conta A ao entrar na B durante falha de leitura. A persistência passou a estar vinculada ao utilizador, empresa e localização; callbacks atrasados conservam o âmbito original. O componente de trabalho remonta quando muda esse âmbito e respostas antigas de membership são ignoradas.
- Sem cache válido, o modo autenticado usava dados de demonstração como fallback. Agora começa sem registos até carregar os dados do âmbito correto. O modo demo explícito mantém os seus dados próprios.
- O botão de retry de uma fatura pendente abria uma avaliação de duplicado da própria fatura e podia provocar `InvoiceVersionPreview is not defined`. Corrigidas a importação/exportação e a rota de retry, que conserva o contexto de operação/revisão existente; não força overwrite nem desativa a validação no servidor.

`src/lib/workspaceStorage.js` extrai a persistência para permitir testes reais de âmbito, callbacks e falhas de quota. Não é uma reescrita do produto. Os dados antigos sem identificação de conta permanecem intactos nas chaves antigas e provocam aviso; não são atribuídos automaticamente à conta que iniciar sessão.

**Bloqueio de rollout:** falta um fluxo supervisionado de atribuição/recuperação de pendentes antigos. A preservação dos bytes não equivale à disponibilidade desses pendentes na nova interface. Não limpar armazenamento para resolver isto. O namespace também não constitui uma barreira de segurança contra JavaScript malicioso da mesma origem.

## Ambiente e limites

Supabase real, exclusivamente local, projeto `marginflow-safety-phase1-lab` em `/private/tmp/marginflow-safety-lab`, API 55431, DB 55432, proxy 55439, browsers em 127.0.0.1:5187 e :5188. As duas origens dão sessões/cache separados com a mesma base. API limitada a **77 linhas por resposta**, abaixo de 1000. Duas contas e empresas fictícias; nenhum dado de cliente copiado.

O runner não copia `.env`, não carrega a configuração de produção e fixa o endpoint local. O browser recebeu CSP que restringe ligações à origem e proxy local. O CLI usou HOME separado para não reutilizar autenticação cloud. Os serviços Docker foram publicados pelo CLI em todas as interfaces; o proxy e frontend apenas em loopback. Não utilizar este laboratório com dados sensíveis. Os serviços deste laboratório são parados no fim, preservando volumes; outros projetos locais não são alterados.

O arranque integral das migrações **falhou**: `20260812120000_migrate_historical_sales_to_relational.sql` depende de dados históricos de uma empresa específica e valida totais inexistentes numa base vazia. A cópia dessa migração foi separada apenas no laboratório para permitir os testes de aplicação com as outras 43; o original no projeto não mudou. Isto não é um replay integral aprovado.

A instalação nova também não tinha SELECT para authenticated em `marginflow_cloud_state`. Foi aplicado exclusivamente o pré-requisito local em `safety/lab/read-grant.sql`, preservando RLS. Não foi comprovado nem corrigido o estado de grants em produção. Os primeiros erros CORS do proxy foram corrigidos na ferramenta de teste.

## Resultados no browser

| Cenário | Resultado e evidência |
| --- | --- |
| Criar e editar | PASS após correção: `LAB-B-BROWSER-01` criada por formulário a £30 e depois editada para £90; mesmo documento, sem duplicado. |
| Reload e nova entrada | PASS: pendente de £90 sobreviveu a reload e sign-out/sign-in antes de recuperar a ligação. |
| Duas sessões | PASS: segunda sessão viu £30 confirmado enquanto a primeira tinha £90 pendente; depois do retry e reload ambas viram £90 confirmado. Não foi um teste de duas edições simultâneas conflituantes. |
| Falha de gravação | PASS após correção: proxy respondeu 503 ao RPC; aviso de pendente e botão Sync failed — Retry. A recuperação confirmou o mesmo ID. A primeira tentativa de retry revelou o crash descrito acima. |
| Confirmação perdida | PASS: servidor gravou `LAB-B-LOST-ACK` de £15, mas o proxy suprimiu a resposta. A interface avisou; restaurada a ligação, reconciliou para Saved to cloud. Browser e leitura autenticada confirmaram apenas um documento com esse número. |
| Pendentes nos relatórios | PASS: lista de edição totalizava £92 (£90 pendente + £2); dashboard manteve £32 (£30 confirmado + £2), não £92. |
| Mais de 1000 linhas | PASS: browser exibiu `LAB-A-1005`, 1005 linhas, £2010; dashboard total £2012 incluindo a fatura base. Carregadas também 1005 repartições apesar do limite de 77 por resposta. |
| Troca de conta | FAIL inicial, PASS no reteste: A→B e B→A com falha de snapshot não mostraram catálogo da conta anterior após correção. A leitura RLS de faturas da outra empresa devolveu zero linhas para ambas as contas. Não substitui auditoria de todas as tabelas, papéis e endpoints. |
| Falha de armazenamento | Aviso visível no browser durante o cenário volumoso; dados confirmados continuaram disponíveis. Quatro testes de persistência incluem quota simulada e ausência de eliminação. A causa exata do aviso volumoso não foi isolada; não se garante durabilidade de novos pendentes nessa condição. |
| Atualização de código/build | PASS limitado: trocados os servidores Vite pelo build validado, nas mesmas portas, sem mexer na base nem limpar browser. As duas sessões recarregaram e os hashes abaixo ficaram iguais. Não comprova compatibilidade de qualquer versão antiga ou futura. |

A primeira comparação de stocks encontrou diferença: o fixture inicial usava `items`, enquanto a aplicação usa `lines` e `totalValue`. Não foi contado como sucesso. Corrigido apenas o fixture fictício, conservando IDs e `items`, com uma linha de 12 unidades a £2, total £24 por empresa, e repetida a comparação. O browser confirmou stock £24 e uma linha após a atualização.

Inventário antes/depois do build: igualdade exata de hash de conteúdo e contagem, incluindo IDs, para 5 faturas, 1009 linhas, 1007 repartições, 2 vendas e 2 snapshots de stock. As tabelas relacionais de stock e linhas de vendas estavam vazias: este ensaio cobre stock por snapshot e cabeçalhos de vendas, **não** persistência de stocks relacionais preenchidos nem repartições de vendas preenchidas. Os hashes e logs foram conservados no arquivo privado do laboratório.

## Verificações automáticas

- `npm test`: **282/282 PASS**, zero falhas e zero skipped (inclui quatro novos testes de armazenamento).
- `npm run safety:check`: **PASS**, 44 migrações originais inalteradas, nenhuma nova.
- `npm run build`: **PASS**, incluindo prebuild e gates; aviso de chunks acima de 500 kB, não suprimido.
- Build isolado via `safety/lab/build.mjs`: **PASS**, com configuração exclusivamente local; foi este o build servido no browser.
- `safety/lab/verify.mjs`: **PASS**, paginação, contagens/ausência de duplicados e leituras de faturas entre empresas bloqueadas por RLS.
- Dependências existentes reutilizadas; não foi executada instalação limpa em máquina independente. Os testes de browser foram manuais assistidos, não uma suite E2E automatizada repetível.

## Backup/restauro

Ensaio de um objeto fictício privado: download para ficheiro local e upload sem overwrite para outro bucket privado, 50 bytes, SHA-256 `ec794343ebb0510f66ee3973f96e1c7ee174e4b0184be6e254b061dbcceeb9c1` idêntico: **PASS para os bytes**. Não prova ligação de anexos às faturas na aplicação nem políticas de autorização de anexos reais.

Dump PostgreSQL custom criado. Restauro transacional para uma nova base `marginflow_restore_20260913`: **FAIL**. Primeiro faltou privilégio de ownership de `supabase_admin`; usando esse administrador local, falhou a ACL da função inexistente `graphql_public.graphql(text,text,jsonb,jsonb)`. Não foram removidas ACLs, objetos ou verificações para ocultar a falha. Cada tentativa com `--single-transaction --exit-on-error` abortou. É necessário preparar um destino Supabase compatível e resolver a dependência/extensão, repetindo depois a reconciliação integral. **Não existe restauro integral aprovado.** Ver `DATABASE_ATTACHMENT_RECOVERY.md`.

## Reverter o código

Antes de reverter, copiar novamente o estado atual, incluindo ficheiros não commitados. O commit desta continuação pode ser revertido com `git revert <commit-da-validacao>` na branch local; a integração anterior pode ser revertida separadamente pelo commit `737f769`. Resolver conflitos preservando alterações posteriores. Não usar reset --hard, git clean ou substituição total do projeto.

Uma reversão de código não reverte dados. O código anterior não lê o novo namespace: exportar/reconciliar primeiro os pendentes por conta e preservar ambos os conjuntos de chaves. Não atribuir automaticamente chaves antigas a quem iniciar sessão. As cópias privadas permitem recuperação de ficheiros individuais, não devem ser extraídas por cima do trabalho atual.

## Antes de vender

Continuam por comprovar: restauro integral de DB e anexos ligados, backups reais recentes/retidos/encriptados e responsáveis, replay portátil de migrações e ACLs, recuperação de pendentes antigos e sob quota, conflitos de edição simultânea/clients antigos, todas as políticas backend e AI (autorização/quotas), eliminação de faturas no servidor, durabilidade dos módulos por snapshot, stocks/vendas relacionais preenchidos, rollback compatível com dados posteriores e controlos efetivos do serviço de publicação. Não foi solicitada nem obtida ligação à produção para preencher estes pontos.
