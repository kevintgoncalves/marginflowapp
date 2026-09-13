# Invoice Control Centre — ajustes e validação focada

Data: 2026-09-13. Branch `ui/unified-invoices`, trabalho iniciado em `e667d10` com árvore limpa. Este resultado substitui a matriz histórica abaixo apenas nos cenários repetidos nesta etapa.

## Matriz atual — ajustes sobre e667d10

| Cenário | Resultado | Evidência |
| --- | --- | --- |
| Apresentação desktop/mobile | PASS | Espaçamento compacto; Add invoices principal e secundários claros; alturas uniformes; quantidade/valor confirmado; estados textuais; No Delivery Day discreto. Quatro fornecedores fictícios, documento único, vários, crédito, Missing, Expected, Not Ordered, revisão e pendente. |
| Mobile e ordenação | PASS | Página 390px com scrollWidth 390px; grelha com indicação de deslizar e fornecedor sticky de 115px. Sort by substitui os cabeçalhos partidos; Amount ascending colocou o crédito −£5 primeiro. Open invoice / Open credit note sem número repetido. |
| Rótulos | PASS | Amount, Cloud status, Filters, 1 supplier e aviso com contagem + Review invoices. |
| Settings | PASS | Pesquisa espaçada. Ao alterar um dia: “Schedule changes await cloud confirmation.”; só depois: “Schedule changes confirmed in the cloud.”. A indicação compara o conteúdo atual com o fingerprint confirmado do módulo; não cria outro mecanismo de persistência. |
| Upload individual | SIMULADO | Ficheiro recebido pelo seletor real; endpoint AI apenas local devolveu o contrato esperado. Revisão mostrou uma linha com matching existente e £7; confirmação criou UI-UPLOAD-SINGLE. |
| Lote de dois ficheiros | SIMULADO | Dois ficheiros recebidos; extração simulada no contrato real; 2 ready, revisão do primeiro, importação final 2 imported / 0 duplicates / 0 failed, valores £7 e £8. Extração, matching e splits não foram reescritos. |
| Integridade das importações | PASS | Leitura posterior das faturas relacionais: exatamente 1 registo para UI-UPLOAD-SINGLE, UI-BATCH-FIRST e UI-BATCH-SECOND. |
| Célula vazia / rascunho | PASS | Upload iniciado em Fictional Supplier B, 08/09, abriu com fornecedor/data preparados. Ficheiro recebido; fechar e Add invoices novamente preservou o rascunho e ficheiro. Data final 13/09 veio da resposta AI simulada, seguindo o comportamento existente. |
| Totais da lista do lote antes de importar | FAIL | Lista mostrou £0 para ambos os documentos Ready; detalhes mostraram £7 corretamente e importação final mostrou £7/£8. Não é aprovado como total de pré-visualização. Não foram alterados cálculos, hidratação ou persistência nesta tarefa. |
| Pendente fora dos totais | PASS | Edição fictícia de £8 para £9 falhou e ficou pendente; ao restabelecer ligação o retry existente confirmou £9. Nova edição para £10 sob fail-write permaneceu pendente após reload; grelha continuou em £9 confirmados, semana £101. Capturas conservam este último estado. |
| Original: existência vs autorização | PASS diagnóstico | Nos dois objetos já associados, leitura por administrador local teve sucesso, com o bucket e caminho exatos da associação. Leitura autenticada do próprio utilizador devolveu Object not found. Os bytes existem; a falha é de autorização, não ausência. Nenhum objeto precisou de ser substituído. |
| Abertura/download autenticado do original | FAIL / bloqueado | O utilizador proprietário não consegue ler no laboratório atual. Resolver exige revisão da autorização Storage existente; nesta tarefa não se aplicam propostas SQL nem se alteram permissões. Não foi usado o administrador para simular sucesso do utilizador. |
| Recusa noutra empresa | PASS, limitado | Ambas as tentativas autenticadas de ler objeto da outra empresa foram recusadas. Este resultado isolado não aprova a política: a leitura própria também falha. |
| Original inexistente | PASS | Novo detalhe sem associação mostra indisponibilidade e download desativado. Captura details.png inclui esse estado. |
| Upload guarda original cloud? | FAIL / lacuna confirmada | Os três uploads finais têm 0 linhas em invoice_files. O fluxo não chama Storage upload nem cria associação. O lote conserva fontes no mecanismo local/IndexedDB, o que não constitui arquivo cloud de originais. Não foi iniciada uma implementação extensa de armazenamento. |
| IA real | NÃO TESTADO | Nenhuma API paga nem credencial de produção. O plugin mock só existe na cópia local; não entrou no código distribuído. |
| Testes / safety / build | PASS | Uma execução de npm run build acionou a validação normal: safety:check, 300 testes (0 falhas/ignorados), guarda de publicação e Vite. 44 migrações intactas. Permanece o aviso de chunks grandes. |

## Preservação e ambiente desta etapa

Cópia privada de código antes de editar: `.marginflow-code-backups/pre-polish-e667d10.tar`, modo 0600, SHA-256 `2fab55676d4541db313c30e70b7816715396b098e7703916a01cda99892acea5`. Não é backup da base de dados. Commit e667d10 e ascendência preservados; nenhuma migração, proposta SQL, fórmula financeira, regra de extração/matching/splits, backend ou dado laboral alterado.

Foi reutilizado exclusivamente `/private/tmp/marginflow-permissions-lab`, API 55631, proxy 55639 e app 5191 em loopback, com CSP local e sem .env de produção. Não houve restauro, auditoria adicional, reset ou eliminação. Foram acrescentados fornecedores fictícios por RPC com revisão, conservando os módulos anteriores em `pre-polish-suppliers.json`. A alteração do calendário de segunda-feira foi feita no browser e confirmada pelo mecanismo existente.

A simulação AI reside em `mock-ai-plugin.mjs` no laboratório: interceta exclusivamente `/api/read-invoice-ai` na cópia Vite e devolve supplier, documentType, documentNumber, invoiceDate, netTotal, grossTotal, vatTotal e lines. Não efetua chamadas externas. O teste confirma a integração com resposta simulada, não qualidade, autenticação, custo ou desempenho da IA real.

Evidências locais sem credenciais nos documentos entregues: `polish-import-evidence.json`, `polish-originals-evidence.json` e `/private/tmp/invoice-polish-validation.log`. A configuração privada e as credenciais do laboratório não são incluídas em Downloads nem no commit. O ensaio deixa a edição fictícia de £10 pendente de propósito; os originais, volumes e armazenamento local são preservados. Os serviços de teste são encerrados ao terminar.

## Capturas atuais

- [Grelha desktop](screenshots/invoice-polish/desktop-grid.png)
- [Grelha mobile](screenshots/invoice-polish/mobile-grid.png)
- [Seleção mobile com Sort by](screenshots/invoice-polish/mobile-documents.png)
- [Settings](screenshots/invoice-polish/settings.png)
- [Detalhes e gravação pendente](screenshots/invoice-polish/details.png)

Entrega adicional numa pasta nova `MarginFlow-Invoice-Polish-*` em Downloads. As capturas anteriores permanecem intactas.

## Limitações e reversão

Não declarar o fluxo completo aprovado: faltam correção/validação do total provisório na lista de lote, autorização de leitura própria no Storage e arquivo cloud de originais. A IA real permanece não testada. As limitações de segurança anteriores continuam aplicáveis.

Para reverter apenas estes ajustes, preservar trabalho posterior e executar `git revert` do commit intitulado `Polish unified invoice presentation and validate isolated uploads`. Não reverter e667d10, limpar armazenamento ou restaurar base de dados. Nenhum push, merge, deploy ou acesso à produção.

---

## Histórico preservado — etapa anterior

# Unified Invoice Control Centre — validação local

Data: 2026-09-13. Branch: `ui/unified-invoices`, baseada em `f66ecda` (`safety/phase-1`). Esta etapa reorganiza a interface; não aprova publicação nem substitui os relatórios de segurança anteriores.

## Histórico — matriz de e667d10

| Cenário | Estado | Evidência / limite |
| --- | --- | --- |
| Navegação única e destino antigo | PASS | Só Invoice Control Centre no menu; `?page=invoices` abre a consulta na página unificada. Atalhos internos conservam a ação; a decisão de duplicado conserva o ID na abertura. Este último caminho foi revisto em código, sem novo upload completo. |
| Vista principal e ações | PASS | Grelha semanal; Add invoices, View invoices, Settings. Sem tabelas permanentes nem blocos Missing invoices, Daily summary e Delivery schedules. |
| Uma fatura | PASS | UI-FICTIONAL-SINGLE em 11/09 abre diretamente detalhes com linhas. |
| Várias faturas e crédito | PASS | 12/09: LAB-B-BASE £31 + LAB-PERMISSION-PROBE £44 − UI-FICTIONAL-CREDIT £5 = £70, três documentos. Semana £78 incluindo documento £8 de 11/09. Seleção permite abrir cada documento e regressar. |
| Edição, falha cloud e retry | PASS | Edição fictícia de £43 para £44 com proxy em fail-write ficou pendente, identificada como não confirmada. Regresso à seleção preservou contexto. Rede online + Retry confirmou £44 sem duplicar o ID. Coleção financeira continua separada da coleção de edição. |
| Revisão | PASS | Fluxo existente Review / Invoice is correct apresentou avisos e confirmou LAB-PERMISSION-PROBE. Avisos das duas novas fixtures continuam visíveis; não foram desativados para aprovar testes. |
| Edições por guardar e teclado | PASS | Escape abre confirmação dentro da app; Keep editing preservou £44. Tab/Shift+Tab ficam no diálogo; Escape e regresso ao elemento de abertura verificados. Só o diálogo superior fica visível. |
| Expected / Not Ordered e calendário | PASS | Domingo manual ativado, Expected observado, Not Ordered aplicado só ao dia. Domingo continuou marcado em Settings após fechar/reabrir e reload. Pesquisa dos fornecedores verificada. |
| Missing em data passada | NÃO TESTADO | Ação conserva a regra existente de expected em data passada; revisão do código concluída, sem nova execução no browser nesta etapa. |
| Falha de leitura não significa ausência | PASS em código/testes | `recordsReady` bloqueia classificações e alterações de ausência durante leitura não verificada; grelha mostra Not verified. Não repetido com falha de leitura no browser nesta etapa. |
| Consulta por fornecedor / geral | PASS | Clique no fornecedor preencheu 07–13/09; filtro Credit notes mostrou apenas −£5. Pesquisa UI-FICTIONAL-SINGLE mostrou apenas £8. Consulta geral preservou pesquisa e filtro de data funcionou. |
| Entrada no upload | PASS | Add invoices abre o componente existente dentro de modal. Campos, Read Document, Add Manual Document, revisão e confirmação continuam presentes. |
| Upload individual e lote completos | NÃO TESTADO | A ferramenta falhou ao entregar ui-upload-single.txt ao seletor (No node found for given backend id). Não há prova de receção do ficheiro; o lote não foi executado. Fixtures de texto estão preparadas fora do Git. |
| AI, matching e splits após upload | NÃO TESTADO no browser | Mecanismos existentes reutilizados, sem reescrita. O Vite isolado não disponibiliza um endpoint AI de teste configurado; falta um serviço `/api/read-invoice-ai` isolado e autorizado. Nenhum acesso a AI/produção foi usado para simular sucesso. |
| Upload a partir de dia vazio | NÃO TESTADO no browser | Código conserva fornecedor/data preparados; se já existir trabalho no upload, abre-o sem substituir o rascunho. Falta teste com ficheiro recebido e confirmação final. |
| Metadados de anexos por âmbito | PASS no laboratório/API | Duas contas fictícias: cada uma recebeu 1 metadado próprio e 0 da outra empresa. Novo leitor exige UUID de empresa, localização e fatura, pagina e verifica o âmbito dos resultados. |
| Original inexistente / inacessível | PASS | Detalhe sem ficheiro mostra indisponível e download desativado. LAB-B-BASE tem metadado; View original falhou e ambas as ações foram desativadas com mensagem explícita. |
| Download autorizado de bytes originais | FAIL no laboratório atual | O Storage devolveu Object not found para os objetos próprios das duas contas. Metadados legíveis não comprovam bytes acessíveis. Não foi possível distinguir ausência física e recusa mascarada neste âmbito UI; nenhuma política foi alterada. Falta objeto acessível e autorização comprovada no laboratório antes de aprovar o caminho positivo. |
| Desktop / mobile | PASS | Capturas 1440×1000 e 390×844. Seleção ampla no desktop e cartões completos roláveis no mobile. Página móvel: scrollWidth = innerWidth = 390; scroll horizontal fica na grelha. |
| Testes automatizados | PASS | 300 testes, 0 falhas, 0 ignorados; inclui 5 novos testes de coleção de consulta, totais assinados e âmbito/erros dos originais. |
| safety:check | PASS | 44 migrações originais intactas, nenhuma migração nova. |
| Build | PASS | Build de produção concluído com prebuild, testes e guardas ativos. Aviso de chunks acima de 500 kB permanece; não foi ocultado. |

## Implementação e preservação

A página Invoices continua montada como motor do upload e lote, com apresentação embutida. Os handlers existentes de extração, matching, revisão, departamentos, aprendizagem e persistência são reutilizados. O Control Centre passa a disponibilizar consulta por fornecedor/período e geral, detalhe, revisão, retry e acesso ao fluxo existente de eliminação. A eliminação não foi exercitada e a limitação de segurança do backend anteriormente documentada não está resolvida por esta UI.

A coleção de consulta sobrepõe apenas versões pendentes ao mesmo ID, preservando revisão e contexto de gravação. Os totais continuam a usar a coleção confirmada e as funções financeiras existentes. Não foram alteradas fórmulas do Dashboard, corpo do Dashboard, repositórios de persistência, propostas SQL, políticas, schema, migrações ou dados laborais.

Os modais de faturas têm foco/Escape e confirmação de saída com edições; os modais subjacentes permanecem montados, escondidos, para preservar filtros, seleção e scroll. Os estilos novos estão limitados ao espaço de faturas. As permissões de calendários continuam separadas das permissões de documentos; importar/adicionar/eliminar respeitam as permissões originais de Invoices.

Os originais são lidos de `invoice_files` com empresa/localização/fatura e descarregados pelo cliente autenticado, usando bucket/caminho armazenados. Nunca se reconstrói um PDF para o apresentar como original. Não foram criados buckets, grants, URLs públicas ou políticas para contornar a falha de acesso.

Estado inicial limpo em f66ecda. Cópia privada recuperável do código antes da edição: `.marginflow-code-backups/pre-unified-f66ecda.tar` (permissões 0600, ignorada pelo Git). Todos os commits anteriores permanecem na ascendência da nova branch. SHA-256 do arquivo: `64ab2b1a57fe9cc60b3fb2cc248a71ce803cc581b7cd4838abb71fdcc6855bd6`. Isto é uma cópia de código, não um backup da base de dados nem dos anexos.

## Ambiente e evidências

Foi reutilizado exclusivamente `/private/tmp/marginflow-permissions-lab`, com Supabase API local 55631, proxy 55639 e Vite 5191. O Vite usa configuração sem os ficheiros .env do projeto e CSP limitada ao laboratório. Só dados fictícios. Os laboratórios de origem/restauro anteriores não foram reiniciados, e o trabalho de restauro não foi repetido.

Foram acrescentadas duas fixtures fictícias de documentos para crédito e abertura individual, conservando as existentes. A primeira construção destas fixtures herdava aliases calculados do modelo, produzindo valores diferentes dos pretendidos; foram corrigidas apenas essas duas fixtures por escrita com revisão, conservando IDs e uma cópia anterior privada em `ui-fixtures-before-normalization.json`. Não foram alteradas fórmulas da app para ajustar o teste. LAB-PERMISSION-PROBE passou de £43 para £44 pelo fluxo de edição testado. O calendário fictício de domingo e a exceção Not Ordered foram conservados.

Evidência auxiliar local, sem credenciais no commit: `ui-originals-evidence.json` no laboratório e logs `/private/tmp/unified-final-test.log`, `/private/tmp/unified-final-safety.log`, `/private/tmp/unified-final-build.log`. As capturas versionadas só mostram dados explicitamente fictícios.

| Vista | Desktop | Mobile |
| --- | --- | --- |
| Grelha | [desktop-grid.png](screenshots/unified-invoices/desktop-grid.png) | [mobile-grid.png](screenshots/unified-invoices/mobile-grid.png) |
| Vários documentos | [desktop-multiple.png](screenshots/unified-invoices/desktop-multiple.png) | [mobile-multiple.png](screenshots/unified-invoices/mobile-multiple.png) |
| Settings | [desktop-settings.png](screenshots/unified-invoices/desktop-settings.png) | [mobile-settings.png](screenshots/unified-invoices/mobile-settings.png) |

A validação visual encontrou e corrigiu uma tabela múltipla demasiado estreita no desktop e campos ocultos por scroll horizontal no mobile. Uma confirmação nativa inicial foi substituída por confirmação integrada após problemas de interação; os resultados atuais acima correspondem à versão corrigida.

## Reverter e próximos requisitos

Para desfazer esta etapa, preservar primeiro qualquer trabalho posterior e fazer `git revert <commit da unificação>` na branch apropriada, resolvendo conflitos sem substituir ficheiros completos. Consultar `git log ui/unified-invoices` para identificar o commit intitulado `Unify invoice workflows in Invoice Control Centre`. Não usar reset hard, não reverter f66ecda, não restaurar uma base de dados como forma de desfazer esta UI e não limpar armazenamento. Pendentes mantêm os mecanismos e formato implementados na fase de segurança; uma reversão não deve descartar operações criadas entretanto.

Antes de considerar o fluxo integral aprovado: concluir upload individual e lote com ferramenta funcional; disponibilizar AI de teste isolada; comprovar acesso autenticado aos bytes originais e recusa entre empresas num ambiente com anexos acessíveis; executar os cenários marcados NÃO TESTADO. A falha de Storage não fica resolvida por esta alteração.

Os bloqueios de lançamento, instalação limpa e segurança restantes em SAFETY_ISOLATED_VALIDATION.md e DATABASE_ATTACHMENT_RECOVERY.md continuam aplicáveis. Não houve push, merge, deploy, migração ou acesso à produção nesta etapa.
