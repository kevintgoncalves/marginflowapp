# Integração local — safety/phase-1

12 de setembro de 2026. Integração concluída localmente; sem publicação.

## Preservação e âmbito

Base: `9a801ca3f01a9664e2e7d3138b52f213ca2a7b7a`, branch inicial `main`.
O Git estava limpo, sem alterações não commitadas nem ficheiros não rastreados.
Antes de editar foi criada a cópia `.marginflow-code-backups/pre-integration-20260912T185525Z.tar.gz`, incluindo o workspace e o histórico Git, excluindo node_modules e dist regeneráveis.
SHA-256: `2e58407fade2e8ca23de92f675fefdcf6f0f4bafa8fb493ccd04e6fa0e2ad1bf`.
O arquivo foi reaberto para verificar a sua legibilidade. Não foi feito um ensaio completo de recuperação do workspace.
A pasta de cópias está excluída do Git e tem acesso restrito; pode conter configuração privada e não deve ser partilhada.
**É uma cópia de código/configuração, não um backup da base de dados ou dos anexos cloud.**

O instalador foi revisto e executado primeiro sem `--apply`: 245 ficheiros compatíveis, 25 alterações.
Depois foi aplicado na branch `safety/phase-1`; os 25 ficheiros instalados correspondem exatamente aos hashes do pacote.
Não foi necessário forçar o instalador nem reconciliar diferenças. O ZIP original foi preservado.
Foi acrescentado apenas este relatório ao conteúdo do pacote.

Inclui paginação com verificação de contagens e revisões, separação entre faturas confirmadas e trabalho pendente, preservação de conflitos, proteção contra leituras anteriores a edições, avisos de falhas locais e pendências, testes, documentação, CI e barreira documental de produção. Inclui também a correção do relógio dos trials fornecida no pacote.

## Validação

Executada numa cópia temporária do código em `/private/tmp/marginflow-phase1-validation`, sem ficheiros `.env` nem variáveis de credenciais herdadas. Não foi aberta a app, executado SQL/migrações, acedido à produção ou alterado armazenamento do browser.
Node 22.14.0, npm 11.2.0. Foram reutilizadas as dependências locais através de uma ligação a node_modules; não foi validada uma instalação limpa com `npm ci`.

- `npm test`: 278 passaram, zero falhas, zero ignorados.
- `npm run safety:check`: passou; as 44 migrações originais permanecem idênticas, sem novas migrações.
- `npm run build`: passou, incluindo `prebuild` com safety:check, os 278 testes e a verificação de release local.
- Build Vite: aviso de chunks acima de 500 kB; bundle principal aproximadamente 3,29 MB, exceljs 940 kB. Aviso não suprimido.
- Barreira de produção invocada com `VERCEL_ENV=production` e sem evidência: recusou como esperado, exit 1. Não foi fabricada evidência para desbloquear produção.
- Reversão do instalador sem `--apply`: verificada, sem modificar código.
- `git diff --check`: passou.

Os testes usam dados sintéticos e clientes simulados: incluem 1.005 faturas, 3.015 linhas e repartições, 1.005 vendas e um limite simulado de 77 registos por resposta. Não provam o comportamento da base real, as políticas de acesso, o ciclo de vida React nem a durabilidade no browser. Os logs locais estão em `.marginflow-code-backups/validation/`.
O relatório original `SAFE_RELEASE_PHASE_1.md` descreve a validação feita pelo autor do pacote; este documento regista o build completo agora realizado.

## Reverter apenas código

Preferir `git revert <commit-da-integracao>` depois de preservar qualquer trabalho posterior e confirmar o commit com `git log --oneline safety/phase-1`. Resolver eventuais conflitos sem descartar alterações posteriores. Não usar reset/clean para reverter esta integração.

Alternativa, a partir da raiz do projeto, verificar primeiro:

```sh
python3 .marginflow-code-backups/apply_safe_patch.py "$PWD" --restore "$PWD/.marginflow-code-backups/20260912T185547Z-zdhdmf2e"
```

Só para executar a reversão, repetir com `--apply`. O instalador recusa ficheiros que já tenham alterações posteriores. Esta alternativa restaura apenas os 25 ficheiros do pacote e não remove este relatório. Não executar ambas as alternativas em sequência. Nenhuma delas restaura uma base de dados.

## Antes de vender a app

Continuam pendentes: autorização e quotas da IA, permissões finas no backend, isolamento do armazenamento entre contas, anulação de faturas no servidor, durabilidade da fila pendente e proteção de módulos baseados em snapshots, conforme a auditoria descrita no pacote. Não foram revalidados em produção nesta integração.

É necessário testar em ambiente e base de teste separados: browser/telemóvel, duas empresas/utilizadores, edições concorrentes, respostas antigas, falhas de rede e armazenamento, reenvios e reconciliação dos totais confirmados. Verificar também o comportamento local-only/offline: os relatórios agora dependem de confirmação cloud fora do modo demo.
Confirmar backups da base e dos anexos, ensaiar restauro isolado, configurar monitorização, checks obrigatórios e reversão compatível. A barreira de release verifica declarações, não autentica a existência dos backups; pipelines que invoquem Vite diretamente podem contorná-la e precisam de configuração real.
Esta fase reduz riscos específicos; não torna a aplicação pronta para venda nem resolve todos os riscos de perda de dados.
