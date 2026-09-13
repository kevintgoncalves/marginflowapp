# Validação isolada — 13 setembro 2026

## Estado atual único — 13 setembro 2026, base 1bd9e5e

Esta matriz é a mesma nos dois relatórios e substitui todas as classificações antigas. **PASS é limitado ao âmbito indicado; não autoriza atualização em produção nem venda.** Evidência detalhada: [privacidade, permissões e browser](SAFETY_PRIVACY_PERMISSION_BROWSER.md). O conteúdo abaixo da marca «Histórico» fica preservado como registo de tentativas, não como lista de bloqueios atuais.

| Verificação | Estado atual | Âmbito / limitação |
| --- | --- | --- |
| Dataset laboral no código/bundle anterior | **FAIL de privacidade potencial identificado** | Origem fictícia não comprovada; presente em Git e bundle, também carregado em demo. |
| Remoção do dataset distribuído | **PASS** | Cópia privada íntegra; import, conversor e reset retirados; demo explicitamente fictício; zero correspondências verificadas no novo bundle. |
| Exposição histórica / publicações anteriores | **NÃO TESTADO** | Histórico preservado; apurar distribuição e acessos com o responsável. Sem produção. |
| Paginação >1.000 linhas, reload/login, falha de rede, troca de conta | **PASS no laboratório anterior** | Mantido o resultado aplicável; não repetido sem alteração relevante. Não certifica todo o dataset herdado como fictício. |
| Pendentes antigos de ID/pertença verificáveis | **PASS browser + testes** | Exportação prévia, revisão/contexto/duplicados verificados; originais mantidos. |
| Pendentes antigos sem prova de pertença | **PASS contenção; recuperação NÃO TESTADO** | Ocultos; falta prova externa e supervisor autorizado. |
| Falha de armazenamento/cloud: exportar e reimportar | **PASS browser** | Linha £43 preservada, arquivo reaberto, staging autenticado, retry confirmado sem duplicado. Memória sem exportação/confirmação pode perder-se ao fechar. |
| Edição simultânea em duas sessões | **PASS browser + API** | £31 confirmado; £32 recusado e conservado como pendente. |
| Pendentes excluídos dos relatórios | **PASS browser** | £74 confirmado após recuperação, em vez de £75 incluindo conflito. |
| Rollback e nova atualização com pendentes | **PASS com backport de privacidade** | f2caa5e sanitizado ↔ atual; IDs/revisão/contexto/linhas preservados. Código antigo sem backport não aprovado. |
| Atualização com stocks/repartições preenchidos | **PASS browser + inventário** | Oito tabelas, incluindo 1.008 linhas, com contagens/fingerprints iguais; stock £24 e vendas £100/£120. |
| Restauro integral DB + objetos + ACLs | **PASS local já concluído** | GraphQL/roles resolvidos; não foi repetido o restauro. Fonte histórica tem limites de proveniência e instalação. |
| Login/anexos no browser restaurado | **PASS com harness** | Sessão normal, bytes legíveis e outra empresa recusada; falta fluxo de anexos integrado na UI do produto. |
| Grants herdados e bypass de revisão | **FAIL da configuração de origem** | TRUNCATE latente e UPDATE REST direto sem incremento de revisão comprovados só em fixtures. |
| Proposta mínima de permissões | **PASS nos caminhos ensaiados** | SQL separado, aplicado só no novo laboratório fictício; precisa de revisão de compatibilidade e restantes módulos. |
| Instalação limpa | **NÃO APROVADA / NÃO TESTADO integralmente** | Falta baseline auditado, linhagem revista e execução de raiz sem exclusões/ajustes manuais. 44 migrações intactas. |
| Testes / safety:check / build atuais | **PASS** | 295 testes, zero falhas/skips; 44 originais intactos; build passou com aviso de chunks grandes. |
| Backups reais, retenção, PITR, RPO/RTO e lançamento | **NÃO TESTADO / não aprovado** | Nenhum acesso à produção; procedimentos locais não comprovam operação real. |

### Bloqueios para atualizar a app existente

Preparar e aprovar a operação de release com alvo verificado, backups recentes da DB **e bytes dos anexos**, restauro/reconciliação comprovados para esse alvo, responsáveis e rollback que preserve pendentes e escritas posteriores. Conservar a remoção do dataset também na versão de rollback. Rever o fecho dos caminhos de escrita que contornam revisão e a compatibilidade dos clientes antes de adotar a proposta SQL. Esta etapa conclui ensaios locais; não declara segura uma publicação sem esses requisitos operacionais.

### Requisitos para vender a novos clientes

Instalação limpa reproduzível continua não aprovada. Faltam revisão do baseline/grants e linhagem, auditoria completa de autorização por empresa/perfil e funções backend, validação de totais recebidos pelo servidor, durabilidade dos módulos por snapshot, fluxos de eliminação e anexos do produto, serviço de publicação/AI e operação de backups/recuperação. Apurar a exposição histórica potencial do dataset laboral antes de distribuir código/histórico. A proposta mínima testada não substitui essa auditoria.

### Recuperações antigas dependentes de prova externa

Faturas nunca confirmadas na cloud e dados sem pertença comprovada permanecem retidos e ocultos. É necessário um responsável legítimo e evidência externa que associe cada original à empresa/localização; o login e o scope escrito no JSON não bastam. Seguir [PENDING_RECOVERY_OPERATIONS.md](PENDING_RECOVERY_OPERATIONS.md), mantendo originais e custódia. Este requisito não autoriza importar dados na conta atual nem apagar arquivos ambíguos.

### Procedimento vigente de recuperação

Seguir [RESTORE_REPRODUCTION.md](../safety/lab/RESTORE_REPRODUCTION.md) para o ensaio Supabase local compatível: bootstrap de roles/extensões, roles/schema/data/histórico, ON_ERROR_STOP e transações com constraints/triggers ativos, reposição exata de ACLs/políticas, objetos Storage com atributos e comparação de IDs/valores/relações/bytes. Não usar a falha GraphQL histórica abaixo como bloqueio ainda aberto. Para serviço real, validar antes o procedimento suportado pelo fornecedor e capturar DB/objetos numa janela coerente, com manifesto, encriptação/retencão e RPO/RTO acordados. Nunca restaurar um ponto antigo sobre trabalho posterior como undo de código. Uma cópia de código não é backup da base nem dos anexos.

## Histórico — resultados e instruções anteriores, não estado atual

**Atualização desta etapa:** consultar a secção «Recuperação e atualização — continuação» no final. O restauro integral anteriormente falhado foi repetido num Supabase compatível; os resultados antigos abaixo são histórico, não o estado final.

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

## Recuperação e atualização — continuação

Base desta etapa: `f2caa5e`, branch `safety/phase-1`, estado Git inicialmente limpo. Preservada cópia privada `pre-recovery-f2caa5e.tar`, além dos arquivos anteriores. Commits anteriores mantidos. Nenhuma ligação à produção, publicação ou alteração das 44 migrações. Os cenários já aprovados só foram repetidos quando afetados pelas novas alterações (permissões/restauro/persistência).

### Código e recuperação

Adicionado painel Settings → Pending invoice recovery. Só mostra versões cujo ID foi confirmado por leitura autenticada da cloud no âmbito específico empresa/localização e sem identificação local contraditória. Um scope no JSON não basta. Exige exportar os originais verificados e confirmar a sua legibilidade antes de adicionar versões elegíveis à coleção pendente. Relê a cloud na recuperação, conserva IDs/revisões/contexto e bloqueia contexto inconsistente, duplicados internos, conflito de revisão e sobreposição de pendentes atuais. O retry é explícito, com o RPC normal; não é efetuado overwrite cloud durante a importação. As chaves antigas não são alteradas pelo fluxo.

Dados sem identidade verificável continuam ocultos/retidos. Foi implementada custódia offline cifrada para um supervisor que já tenha acesso legítimo ao arquivo, sem atribuição automática nem acesso do utilitário ao browser. **Ainda falta a prova externa de pertença e o responsável/mecanismo confiável de atestação para recuperar faturas nunca gravadas na cloud.** Não são declaradas recuperadas. Procedimento e limites: `PENDING_RECOVERY_OPERATIONS.md`.

Corrigido o editor para usar a revisão da versão que abriu, em vez da revisão da coleção que possa entretanto ter sido atualizada. Versões sem revisão válida param para reconciliação. O controlo de revisão no servidor permaneceu ativo.

A persistência agora retém em memória os writes rejeitados e regista nome do erro/chave/tamanho, sem conteúdo no diagnóstico. O aviso permite exportar o snapshot atual e esses writes sem voltar a escrever em localStorage. Fechar/recarregar/sair pode perder o que só está em memória se não existir exportação legível ou confirmação cloud. beforeunload não garante proteção contra crash. O importador de pendentes aceita também esse arquivo vivo, com os mesmos controlos de pertença.

### Causa do aviso e correção do âmbito do laboratório

Medição no browser antes da injeção de falha: aproximadamente 8.902.950 bytes UTF-16 de valores; `marginflow.labour` do âmbito A ocupava 7.723.630, contra 1.138.268 das faturas. O payload cloud tinha 10.355 linhas de labour, herdadas do fallback `createInitialLabourData()` do código anterior. O fallback autenticado já tinha sido removido em `f2caa5e`, mas os dados existentes permaneceram, como exigido. Não foram limpos nem substituídos.

**Correção à descrição anterior de “todos os dados fictícios”:** este conjunto incorporado de labour não teve origem fictícia comprovada. Não foi obtido de produção por esta tarefa; tinha sido carregado pelo código anterior. Nesta investigação só foram inspecionados tipos, tamanhos e contagens, sem apresentar nomes ou valores pessoais. O seu conteúdo fica preservado em custódia privada e não serve como fixture de negócio aprovado. Os novos testes usam as faturas, stocks, vendas e anexos explicitamente fictícios.

O erro exato da execução anterior não foi registado e não reapareceu logo no primeiro reload; portanto a atribuição histórica à quota é uma hipótese sustentada pelo consumo, não certeza retrospetiva. A quota foi reproduzida agora acrescentando uma única chave de padding fictício, sem apagar outras: `QuotaExceededError`. Uma edição fictícia de £12 com campo de teste grande e falha cloud foi recusada pelo armazenamento. O aviso não afirmou gravação; a exportação reabriu e continha a versão de £12 e o write rejeitado. A tentativa de escrever invoices media 4.314.398 bytes no diagnóstico. Padding e originais ficaram preservados.

### Matriz desta etapa

| Cenário | Resultado |
| --- | --- |
| Pendentes anteriores, ID existente verificável | **PASS browser**: `LAB-B-BASE`, £2 confirmado e £7 pendente fictício. Exportação descarregada e reaberta, com IDs/revisão/contexto. Recuperada como pendente; cloud não sobrescrita. |
| Pendente antigo sem identificação | **PASS para contenção**: um exemplo oculto, só contagem visível; nome/conteúdo ausentes da exportação normal. Recuperação efetiva: **NÃO TESTADO/BLOQUEADO por falta de prova externa de pertença**. |
| Duplicados/contexto/revisão/pendente atual | **PASS unitário**: bloqueados, com os originais intactos; inclui contexto que tenta redirecionar para outro ID. |
| Falha de armazenamento e cloud | **PASS browser**: QuotaExceededError + Sync failed, exportação do trabalho em memória validada. Importação desse arquivo: **PASS unitário**, ciclo completo no browser **NÃO TESTADO**. |
| Custódia cifrada ambígua | **PASS unitário**: bytes originais recuperados, sem plaintext no envelope, adulteração e chave errada recusadas. Não prova pertença. |
| Duas sessões editam mesma fatura | **PASS API**: duas sessões autenticadas, uma única gravação aceite, segunda `invoice_revision_conflict`, versão recusada exportada. Interação simultânea no browser e reteste do editor: **NÃO TESTADO**. |
| Código anterior e novo | **PASS API**: `f2caa5e` e código novo recusaram o pendente desatualizado, mantendo IDs, linhas, contexto e a gravação posterior. Rollback/re-upgrade completo no browser: **NÃO TESTADO**. `737f769` não está aprovado para recuperar o namespace novo. |
| Stocks relacionais e repartições de vendas | **PASS dados/restauro**: preenchidos 2 stocktakes, 2 linhas e 2 repartições de vendas, £24 por stock e £100/£120/£20 nas repartições; hashes iguais entre fonte no ponto capturado e restauro. Atualização completa no browser com esses dados: **NÃO TESTADO**. |
| Restauro DB em Supabase compatível | **PASS local**, com limites abaixo: roles/schema/data/história, transações, triggers e constraints ativos; relações FK verificadas. |
| Anexos associados a faturas | **PASS API** antes/depois: invoice_files aponta para a fatura correta; bytes/tamanho/SHA-256 coincidem; conta autorizada lê e outra empresa é recusada, incluindo metadados. Browser no destino restaurado: **NÃO TESTADO**. |
| Instalação limpa | **NÃO APROVADA**: proposta separada, candidato privado e manifesto; falta baseline auditado/linhagem e execução nova sem correções manuais. |

O bloqueio de browser surgiu durante a continuação em Settings: a revisão automática informou limite de utilização da ferramenta. Não foi contornado com outro browser, CDP ou comandos indiretos. As verificações API são testes independentes e não foram apresentadas como E2E de browser.

### Restauro: falhas resolvidas e limites

Novo projeto `marginflow-safety-restore`, API 55531/DB 55532, inicializado pelo mesmo CLI/PostgreSQL da origem, sem migrações ou dados da app no arranque. O bootstrap Supabase preparou roles/extensões/GraphQL compatíveis. O dump suportado separou roles, schema e data, sem excluir tabelas. O histórico restaurado contém as **43** migrações efetivamente aplicadas na origem; a histórica não foi inventada como aplicada.

A revisão automática recusou `session_replication_role=replica`; a opção **não foi executada**. A importação passou mantendo triggers/constraints ativos, com `--single-transaction` e `ON_ERROR_STOP=1`. A primeira tentativa de histórico omitiu o nome da base e falhou antes de alterar dados; corrigido `-d postgres`, passou.

`docker cp` preservou bytes mas perdeu atributos estendidos do backend Storage local, provocando ENODATA. A cópia foi refeita com GNU tar `--xattrs --acls`, origem read-only, contentor auxiliar sem rede e imagem já instalada; paths, IDs e versões da base permaneceram. Os anexos ligados voltaram a ser legíveis por API autenticada.

A comparação de ACLs detetou grants adicionais introduzidos pelos defaults do destino: 783 privilégios de tabelas/sequências e 150 de funções. Foi gerado um script a partir da diferença com a origem e restauradas **as permissões efetivas originais**, sem retirar permissões da origem nem desativar RLS. A comparação semântica final de ACLs de tabelas e funções, políticas, extensões e histórico coincidiu. As políticas Storage personalizadas foram restauradas separadamente. A proposta e gerador ficam documentados em `safety/lab/RESTORE_REPRODUCTION.md` e `prepare-acl-restore.py`.

A comparação de 80 tabelas públicas preservou contagens e conteúdo de negócio. Diferenças posteriores identificadas: updated_at de um profile e timestamps/revisões de oito snapshots de configuração, com payloads iguais, devido a sessões/atividade após o dump. Não foram “corrigidas” por sobrescrita. Uma fatura adicional criada depois para concorrência também permanece só na origem. Um restauro de ponto anterior não deve apagar esse trabalho posterior.

O laboratório de origem continua a ter a adaptação histórica da etapa anterior e o conjunto labour de proveniência não comprovada. Este PASS é de recuperação local desse estado, não de instalação limpa, backup exclusivamente fictício certificado, produção ou auditoria completa de segurança. Grants herdados como TRUNCATE para authenticated ainda precisam de revisão; preservá-los no restauro não os torna adequados para lançamento.

### Verificações finais e próximos requisitos

`npm test`: **293 PASS**, zero FAIL/skipped; `safety:check`: **PASS**, 44 originais intactos, nenhuma nova migração; `npm run build` e build isolado: **PASS**, aviso de chunks grandes mantido. As novas propostas não foram movidas para migrations nem aplicadas em produção. Os testes e builds foram repetidos porque o código mudou.

Faltam concretamente: ferramenta de browser novamente disponível para concluir E2E de concorrência/rollback/reimportação/atualização com relacionais; responsável e prova de pertença dos pendentes nunca confirmados; baseline de instalação revisto e instalado de raiz; saneamento por custódia do dataset laboral herdado antes de certificar fixtures exclusivamente fictícios; auditoria de permissões mínimas e restante checklist de produção. Não houve push, merge ou deploy.

Para reverter esta etapa, preservar primeiro pendentes e exportações e usar `git revert <commit-desta-etapa>`; não fazer reset/clean. A volta a `f2caa5e` remove o painel novo, mas mantém o namespace. Conservar uma cópia da versão de recuperação e os arquivos; não traduzir pendentes para chaves globais e não restaurar a base como undo de código.

As evidências, exportações e logs desta etapa foram guardados em `.marginflow-code-backups/recovery-stage-20260913.tar.gz` (0600, ignorado pelo Git), mantendo os arquivos anteriores. Os dois Supabase e os três servidores de teste foram parados; o CLI confirmou preservação dos dados nos volumes. O arquivo contém material de custódia do laboratório, incluindo o dataset herdado de origem não comprovada, e não deve ser publicado nem tratado como backup de produção.
