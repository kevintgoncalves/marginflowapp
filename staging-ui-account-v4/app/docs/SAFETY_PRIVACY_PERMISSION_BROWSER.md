# Evidências da etapa de privacidade, permissões e browser

Base `1bd9e5e`, branch `safety/phase-1`. Trabalho anterior inicialmente limpo, commits preservados. Cópia recuperável privada `pre-privacy-1bd9e5e.tar` antes de editar. Não houve produção, push, merge, deploy, limpeza de caches/IndexedDB/localStorage, eliminação de registos ou reescrita de histórico.

## Dataset laboral distribuído

O dataset estava num literal versionado de `src/labourSeedData.js`, introduzido em `6640cb0` (23 junho 2026). Contagens inspecionadas sem reproduzir conteúdo: 115 colaboradores, 10.355 linhas laborais, 112 entradas de histórico de taxas, 576 vendas, 5 departamentos e 65 categorias. Não foi encontrada prova suficiente de que se tratasse de dados fictícios.

O import estático alimentava `createInitialLabourData()`. O fallback autenticado já tinha sido retirado em `f2caa5e`, mas restavam a função e o botão de reset laboral. O bundle anterior continha todos os 115 identificadores textuais de colaboradores usados na verificação privada. O modo demo criava exemplos próprios, mas carregava o mesmo bundle com o dataset herdado. Logo existia exposição potencial no código e no JavaScript entregue ao navegador, mesmo sem abrir Labour. Não se verificou o que foi efetivamente publicado, quem acedeu ou a visibilidade do repositório remoto.

Preservou-se o ficheiro original em `.marginflow-code-backups/labour-custody/labourSeedData.original.js`, permissões 0600/pasta 0700, com verificação de integridade. Tamanho 1.807.730 bytes; SHA-256 `b8481d1d46135b6367c526c0cd8758197e8724a9f88ce19868eb61e8c8a4ff1a`. Estes arquivos privados não são backup da base de dados.

Retirados do código distribuído: ficheiro literal, import, conversor e caminho/botão de reset que o reinjetava. Os onze exemplos de colaboradores do demo passam a ter nomes explicitamente `Fictional Staff NN`, mantendo os IDs e estrutura demonstrativa. Não foram alterados registos existentes, snapshots, caches nem arquivos antigos. A cópia de código do laboratório anterior foi atualizada colocando o ficheiro retirado fora da pasta servida, em quarentena privada.

**PASS no código atual e build:** ausência do import/caminho de reset e zero correspondências dos identificadores antigos na pesquisa dos ficheiros textuais versionados e no bundle reconstruído. Esta pesquisa não é uma auditoria de imagens/screenshots, todos os dados pessoais possíveis, caches de destinatários ou publicação passada. **Histórico: exposição potencial permanece**, por decisão de preservar Git. Antes de partilhar o repositório ou vender, o responsável deve apurar proveniência, acessos e distribuição histórica e decidir o tratamento apropriado; não reproduzir o dataset em tickets/relatórios públicos. Não reverter esta remoção ao fazer rollback.

## Browser — resultados atuais

A ferramenta voltou a funcionar. Usaram-se duas origens isoladas 5191/5192 ligadas apenas ao novo laboratório 55631 através do proxy 55639, com CSP e ambiente sem configuração de produção. Este laboratório importou schema/ACLs, **não dados** do laboratório herdado. Todas as fixtures de negócio usadas aqui são explicitamente fictícias. O restauro anterior foi somente reiniciado para completar o browser, sem repetir a importação.

| Cenário | Evidência e resultado |
| --- | --- |
| Duas sessões editam a mesma fatura | **PASS browser:** ambas abriram LAB-B-BASE a £2; sessão 1 gravou linha £31, sessão 2 tentou £32 com revisão anterior. £32 permaneceu Sync failed; a cloud conservou £31. |
| Pendentes fora dos relatórios | **PASS browser:** antes da recuperação, relatório £53 = £31 confirmado + £22 em linhas da fatura de prova; não £54. Depois, £74 = £31 + £43 confirmado, não £75 com o pendente £32. |
| Falha de armazenamento + cloud, exportação/reimportação | **PASS browser:** injetor exclusivamente no código de teste rejeitou setItem de invoices com QuotaExceededError e proxy recusou writes. Linha £43 ficou Sync failed e aviso explícito de possível perda ao fechar/recarregar/sair. Exportação descarregada/reaberta conservou linhas, IDs, revisão, retry context e write rejeitado. Importada na segunda sessão, validada pela cloud, exportados/reabertos originais, confirmação e staging; retry explícito confirmou £43. Duas faturas B antes/depois, sem duplicado; conflito da outra fatura preservado. |
| Falha do seletor de ficheiros | **FAIL da primeira tentativa de ferramenta**, sem importação; uma nova tentativa após verificar a página concluiu. Não houve contorno de limites. |
| Rollback e nova atualização | **PASS limitado:** atual → f2caa5e com backport de privacidade → atual, na mesma origem/DB. £32 pendente e £43 confirmado sobreviveram. Retry da versão anterior e nova recusou o conflito. Exportação anterior ao rollback conservada. Não foi servido f2caa5e original porque distribui o dataset não comprovado. Rollback sem esse backport **não aprovado**. |
| Atualização com relacionais preenchidos | **PASS browser + inventário:** stock £24/uma linha permaneceu visível; repartição de vendas £100 líquido/£120 bruto apareceu no dashboard. O stock mostrado pela app continua baseado no snapshot; o inventário separado comprova também a preservação relacional. Oito tabelas mantiveram contagem e fingerprint de todas as linhas/IDs/relações/revisões antes/depois. |
| Login e anexo no destino restaurado | **PASS browser com limite:** login normal da conta fictícia B na app 5193 → Supabase restaurado 55531. Página auxiliar de leitura, usando essa sessão e sem service role, listou um anexo, abriu os bytes fictícios e recusou o anexo da outra empresa. A app atual não tem fluxo de abertura ligado a invoice_files; o harness comprova browser/Auth/Storage, não uma interface comercial de anexos concluída. |

O total documental exportado pode conservar o valor declarado original, enquanto a edição se encontra nas linhas. A primeira inspeção verificou só esse campo e foi inconclusiva; a inspeção das linhas e o ciclo completo comprovaram £43. Não se alterou o arquivo nem a aplicação para fazer passar a asserção errada.

O injetor desta etapa simula a exceção de persistência; a quota real já foi reproduzida na etapa anterior e não foi novamente preenchido o armazenamento. Fechar a página sem exportação legível ou confirmação cloud pode perder as alterações que só existem em memória. Nem beforeunload nem uma cópia do código garantem a sua recuperação. A exportação normal não permite atribuir pendentes ambíguos a quem iniciar sessão.

Inventário antes/depois da troca de código: invoices 4; invoice_lines 1.008; invoice_line_department_splits 1.007; stocktakes 2; stocktake_lines 2; sales_entries 2; sales_department_lines 2; invoice_files 2. Contagens e fingerprints integrais coincidiram. Nenhum dump foi restaurado por cima destas alterações posteriores.

## Permissões e limites de lançamento

A [proposta separada](../safety/proposals/MINIMUM_API_PRIVILEGES.md) documenta o grant TRUNCATE, o bypass real via REST, o SQL mínimo e os testes positivos/negativos no laboratório descartável. A proposta não foi incorporada em migrações nem aplicada fora do laboratório. Faltam revisão de compatibilidade e cobertura dos outros módulos/perfis. A [instalação limpa](../safety/proposals/CLEAN_INSTALL.md) permanece não aprovada: este ensaio usou schema existente, não validou um baseline novo auditado.

## Reversão e custódia

Preservar pendentes/exportações e a cópia privada antes de qualquer reversão. Uma reversão de código deve conservar o namespace por conta, os IDs/revisões e o backport de privacidade. O ensaio comprovou essa combinação em f2caa5e, não versões mais antigas ou reintrodução de chaves globais. Usar commits corretivos/revert seletivo revisto; não git reset/clean nem restauro da DB como undo. Se um revert voltar a introduzir o dataset, parar e manter a remoção antes de executar/buildar/servir a cópia.

O patch privado `privacy-backport.patch` contém contexto histórico e não deve ser publicado como artefacto genérico. Exportações, configurações de teste, inventários, fixtures e logs ficam em custódia privada ignorada pelo Git. O laboratório antigo e o destino restaurado ainda conservam o dataset herdado; apenas a conta B fictícia foi usada no browser restaurado. Não certificar esses dumps antigos como exclusivamente fictícios.

## Verificações finais e preservação do ensaio

`npm test`: **295 PASS**, zero FAIL/skipped. `npm run safety:check`: **PASS**, 44 migrações originais intactas, nenhuma nova migração. `npm run build`: **PASS**, mantendo o aviso de chunks superiores a 500 kB. A pesquisa privada no build final encontrou zero dos 115 identificadores laborais anteriores. Os scripts de laboratório passaram também a verificação sintática e o diff não apresenta erros de whitespace.

Evidências guardadas em `.marginflow-code-backups/privacy-permissions-browser-20260913.tar.gz` (0600, ignorado), além de `privacy-stage-working.patch`, da cópia inicial e da custódia laboral. O arquivo contém código/configuração/fixtures/exportações/logs de teste; **não contém um novo backup integral da DB**. Os volumes Supabase existentes foram preservados ao parar `marginflow-permissions-lab` e `marginflow-safety-restore`; os quatro servidores de teste e as três sessões de browser foram fechados. Nenhum cache ou registo foi limpo.
