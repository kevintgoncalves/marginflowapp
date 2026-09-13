# Procedimento de backup e restauro — pendente de aprovação operacional

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
