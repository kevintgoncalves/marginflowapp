# Procedimento de backup e restauro — pendente de aprovação operacional

**Atualização:** o ensaio local seguinte passou no novo Supabase compatível, incluindo anexos ligados e ACLs reconciliadas. Ver «Ensaio seguinte» no final. A aprovação operacional/produção continua pendente.

Este procedimento não foi executado em produção. Uma cópia do código não é backup da base. O ensaio local de 13 setembro está em `SAFETY_ISOLATED_VALIDATION.md`: bytes de um anexo passaram; restauro integral da base falhou numa dependência GraphQL. Não vender a aplicação com base apenas nesse ensaio.

## Preparação e responsabilidade

Identificar por escrito projeto/origem, versão PostgreSQL/Supabase, região, extensões, funções, roles, RLS, storage providers/buckets privados e referências de anexos. Definir responsável, substituto, janela, RPO (perda máxima aceitável) e RTO (tempo máximo de recuperação); estes valores ainda não foram acordados. Inventariar também configurações de Auth, OAuth, SMTP, funções, webhooks e segredos num cofre separado. Não pôr credenciais, dumps ou dados de clientes em Git ou relatórios públicos.

Confirmar política de backups/PITR e retenção no serviço real, proteção contra eliminação e cópia encriptada fora do domínio de falha principal. A documentação Supabase esclarece que backups da base contêm metadados de Storage, não os bytes dos objetos: [Database backups](https://supabase.com/docs/guides/platform/backups).

## Captura

1. Confirmar alvo explicitamente e autorização da operação. Registar UTC, identificação imutável do backup, versão do código e schema. Suspender gravações durante a captura coordenada ou usar snapshot/PITR e versionamento de objetos que permitam reconciliar a mesma janela; sem isso, registar a inconsistência temporal como limitação.
2. Obter backup transacional suportado pelo serviço. Para exportação lógica entre projetos Supabase, seguir o fluxo oficial de roles, schema e dados, incluindo personalizações/migrações: [Backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Não supor que um pg_dump genérico para PostgreSQL vazio reproduz toda a plataforma; o ensaio local mostrou precisamente essa falha.
3. Exportar separadamente todos os objetos anexos por API/ferramenta do storage, paginando listagens. Criar manifesto com bucket, caminho, versão quando disponível, tamanho, tipo MIME e SHA-256 calculado a partir dos bytes. Preservar ACLs/políticas e referências da base. Nunca tornar buckets públicos para facilitar o backup.
4. Registar inventário por empresa/localização: IDs, contagens, montantes de faturas confirmadas, linhas/repartições, vendas, stocks, snapshots, ligações e anexos ausentes/órfãos. Guardar hashes do dump e manifesto em armazenamento encriptado restrito. Verificar legibilidade e integridade antes de considerar a captura concluída.

## Restauro de prova, sempre num destino novo isolado

1. Criar projeto de teste compatível, sem clientes, integrações de envio, pagamentos, webhooks ou jobs externos ativos. Não restaurar sobre a origem. Preparar extensões, roles e personalizações suportadas antes da importação; preservar políticas, não contornar erros com --no-acl ou ignorar exit codes.
2. Restaurar com falha imediata e transação quando suportado. Guardar logs sem segredos. Qualquer erro torna o ensaio FAIL até ser corrigido e repetido por inteiro. No laboratório está por resolver `graphql_public.graphql(text,text,jsonb,jsonb)` e as suas ACLs no destino vazio.
3. Restaurar os bytes dos anexos em buckets privados apropriados, sem sobrescrever a origem. Validar cada SHA-256, tamanho, contagem, caminho e associação à fatura. Testar leitura como utilizador autorizado e recusa entre empresas; um download com service role não comprova autorização.
4. Comparar o inventário integral com o ponto de recuperação: nenhum ID perdido, totais iguais, referências íntegras, anexos legíveis. Testar login, faturas, stocks e vendas no browser desse destino, com duas contas e sessões.
5. Registar duração real, RPO/RTO obtidos, backup/manifesto usados, checksums, falhas e sign-off do responsável. Repetir periodicamente e após mudanças de esquema, políticas ou storage. Só então afirmar que o restauro foi comprovado.

## Incidente e reversão

Reverter código é uma operação distinta. Um restauro antigo pode eliminar trabalho criado depois do backup. Preservar primeiro uma captura do estado afetado e os pendentes dos browsers; restaurar para outro destino, reconciliar escritas posteriores e aprovar uma mudança de alvo explícita. Nunca ligar automaticamente a aplicação a uma cópia antiga nem importar backups sobre dados atuais como rotina de atualização.

## O que falta exatamente

Acesso autorizado ao painel e políticas reais de backup, identificação do projeto a recuperar, credenciais temporárias restritas em cofre, destino de restauro compatível, inventário real de buckets/referências, método de captura coerente entre DB e objetos, retenção/encriptação verificadas, responsável e RPO/RTO acordados, correção da dependência encontrada no restauro local, e evidência de reconciliação/browser do restauro completo. Nada disso foi presumido ou substituído por um PASS fictício.

## Ensaio seguinte — 13 setembro 2026

**Resultado local: PASS com limites de âmbito.** O erro GraphQL/roles foi resolvido inicializando um novo projeto Supabase local compatível (`marginflow-safety-restore`) em vez de uma base PostgreSQL vazia. Foram restaurados roles/schema/data e o histórico real, com transações, ON_ERROR_STOP, triggers e constraints ativos. A opção de desativar triggers foi recusada pela revisão automática e não foi usada. Não houve produção.

O procedimento reproduzível está em `../safety/lab/RESTORE_REPRODUCTION.md`. O dump e os objetos do laboratório existente foram preservados em `backup-v2/`. O histórico tem 43 migrações: o ensaio não torna a migração histórica omitida num facto executado.

A cópia do volume Storage precisou de GNU tar `--xattrs --acls`; `docker cp` tinha perdido atributos e provocado ENODATA. O volume de origem foi montado read-only e o auxiliar executado sem rede. Foram mantidos caminhos e versões. Criaram-se previamente dois anexos explicitamente fictícios ligados por `invoice_files.invoice_id` às faturas de A/B. A leitura autenticada funcionou na origem e no destino, SHA-256 e tamanho coincidiram e o acesso da outra empresa foi recusado tanto nos metadados como nos bytes. Isto foi teste API; abertura de anexos no browser restaurado continua NÃO TESTADO.

A comparação inicial de grants revelou acesso adicional proveniente dos defaults da plataforma nova. O dump de GRANTs não bastou para reproduzir revogações da origem. Foi feita reposição exata das ACLs da origem, incluindo a remoção exclusivamente dos privilégios adicionais do destino (783 em tabelas/sequências, 150 em funções). Nenhuma permissão original foi retirada para ocultar uma falha; RLS permaneceu ativo. Os fingerprints semânticos finais de tabelas/funções, RLS, extensões e histórico coincidiram. A política Storage personalizada foi reposta separadamente; este passo passa a ser obrigatório na reprodução, antes de aceitar o resultado.

Foram comparadas 80 tabelas públicas e verificadas relações FK de public/auth/storage. Dados de negócio e referências preservados, incluindo stocks relacionais e repartições de vendas preenchidos. Diferenças posteriores ao dump em updated_at de profile e timestamps/revisões de configurações foram identificadas; payloads de configuração iguais. Trabalho criado na origem após o ponto de restauro foi preservado e não copiado de volta por cima da origem. O relatório de validação contém a distinção entre estas diferenças esperadas e a integridade do ponto recuperado.

**Limitações ainda abertas:** o laboratório herdou pelo fallback antigo um conjunto laboral incluído no código cuja natureza fictícia não está comprovada; foi preservado privadamente, sem exibir o conteúdo, e não usado como fixture de negócio aprovado. O restauro recupera o estado existente, mas não certifica uma base de testes exclusivamente fictícia. O esquema de origem depende da adaptação histórica anterior, pelo que a instalação limpa continua NÃO APROVADA. O candidato de baseline/grant está em `../safety/proposals/CLEAN_INSTALL.md`, separado das 44 migrações.

Não foram comprovados backups de produção, PITR, retenção, encriptação em serviço externo, RPO/RTO acordados, integrações externas, todas as roles/permissões ou fluxo integral de recuperação no browser. A existência de TRUNCATE herdado para authenticated precisa de revisão de privilégios mínimos; o restauro ter preservado essa ACL não aprova a sua utilização comercial.

O próximo ensaio de browser depende da ferramenta voltar a estar disponível. A recuperação de pendentes ambíguos depende de prova externa de pertença e responsável autorizado, conforme `PENDING_RECOVERY_OPERATIONS.md`. Nenhuma cópia de código substitui este backup de DB e ficheiros, e nenhum destes ensaios autoriza publicação.
