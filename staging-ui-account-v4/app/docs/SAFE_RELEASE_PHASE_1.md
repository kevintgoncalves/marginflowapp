# MarginFlow — proteção de dados, fase 1

12 de setembro de 2026. Versão preparada numa cópia do ZIP analisado. Não publicada.

## Alterações incluídas

- Leitura paginada e verificada de faturas, linhas, divisões e vendas.
- Rejeição de cargas incompletas e de faturas que mudam de revisão durante a leitura.
- Coleção separada de faturas confirmadas para dashboard, GP, fornecedores e Invoice Centre.
- Lista de trabalho das faturas preservada, incluindo edições pendentes e conflitos.
- Proteção contra uma leitura iniciada antes de uma nova edição substituir esse trabalho.
- Aviso visível quando a escrita local falha; remoção de mensagens que prometiam gravação local sem a verificar.
- Correção do relógio usado na apresentação dos trials.
- Regras permanentes em AGENTS.md e .ai/DATA_SAFETY.md.
- Testes e verificação de migrações executados automaticamente antes do build via `prebuild`.
- Barreira de produção que exige evidência de backup/restauro/staging para o código exato.

Não foram alteradas migrações, stocks, receitas, preços, vendas reais, dados de clientes,
chaves, configuração do projeto Supabase ou histórico de produção. A alteração dos
inputs financeiros pode corrigir valores anteriormente calculados com faturas pendentes;
isso deve ser reconciliado em staging, não confundido com eliminação de dados.

## Validação local

278 testes passaram, incluindo os 268 testes anteriores e dez casos adicionais.
O limite de resposta foi simulado a 77 registos; a leitura recuperou 1.005 faturas,
3.015 linhas e 3.015 divisões. Também foram verificadas 1.005 entradas de vendas.
Testados erros intermédios, revisões alteradas, filas pendentes e regras da barreira de produção.
As 44 migrações originais estão idênticas byte a byte. A sintaxe JSX foi verificada.

O build completo e os testes de browser/staging ainda não foram executados: a instalação
offline das dependências não conseguiu obter todos os pacotes necessários. A suite
Node não substitui estes testes. Não foram feitos testes ou backups na base real.

## Aplicar o pacote sem sobrescrever trabalho posterior

O pacote de alterações inclui um instalador local que começa em modo de verificação.
Apontar para a pasta que contém `package.json`; não para a pasta `src`.

```bash
python3 apply_safe_patch.py "/caminho/para/MarginFlow work edition"
```

Se todos os ficheiros corresponderem à versão analisada, pode aplicar numa cópia/branch:

```bash
python3 apply_safe_patch.py "/caminho/para/MarginFlow work edition" --apply
```

O instalador preserva os ficheiros anteriores e recusa substituir uma versão diferente.
Não toca em .env, .git, node_modules, configuração privada de alojamento ou dados cloud.
A cópia criada pelo instalador é **apenas de código**. Não é um backup de clientes.

Para reverter código, usar o caminho de backup apresentado pelo instalador:

```bash
python3 apply_safe_patch.py "/caminho/para/MarginFlow work edition" --restore "/caminho/do/backup"
```

Também a reversão começa em modo de verificação; acrescentar `--apply` para executar.
Só restaura ficheiros que ainda correspondem ao patch, para preservar alterações posteriores.
Não restaura qualquer base de dados.

## Antes de publicar

1. Confirmar que a versão base corresponde à aplicação real; se o projeto mudou,
   reconciliar as alterações. Nunca forçar a instalação sobre código diferente.
2. Instalar dependências com `npm ci`, executar `npm test`, `npm run safety:check`
   e `npm run build` num ambiente de staging separado, com dados de teste.
3. Testar browser, telemóvel, dois utilizadores, duas empresas, rede interrompida,
   edições simultâneas, drafts, revisão, reenvio, contagens e totais.
4. Confirmar backups recentes da base de dados e dos anexos. Restaurá-los numa
   cópia isolada, verificar faturas, vendas, stocks e ficheiros e guardar a evidência.
5. Verificar as políticas de acesso reais e os bloqueios restantes da auditoria.
6. Preparar monitorização e reversão compatível. Reverter o código não deve apagar
   registos criados depois da atualização. Uma restauração da base inteira pode
   perder trabalho posterior e nunca deve ser um passo automático.

## Barreira no build de produção

`npm run build` executa testes e checks através de `prebuild`. Em Vercel Production,
o build falha sem `MARGINFLOW_RELEASE_EVIDENCE` válido. Para outros pipelines,
definir `MARGINFLOW_REQUIRE_RELEASE_EVIDENCE=true` e executar o mesmo build.
Invocar `vite build` diretamente contorna os scripts npm; o pipeline real deve
usar `npm run build` e configurar os checks como obrigatórios.

Obter a impressão digital do código final:

```bash
node scripts/check-production-release.mjs --fingerprint
```

A variável de produção deve conter JSON com esta estrutura, preenchido **apenas
depois das verificações reais**. O exemplo não contém evidência válida e não desbloqueia nada:

```json
{
  "sourceFingerprint": "PREENCHER_COM_HASH_DO_CODIGO_FINAL",
  "databaseProjectRef": "PREENCHER_COM_PROJETO_PRODUCAO",
  "reviewedBy": "PREENCHER_COM_RESPONSAVEL",
  "verifiedAt": "DATA_ISO_UTC",
  "databaseBackup": {"reference": "ID_DO_BACKUP_REAL", "createdAt": "DATA_ISO_UTC"},
  "attachmentBackup": {"reference": "ID_DO_BACKUP_DE_ANEXOS", "createdAt": "DATA_ISO_UTC"},
  "restoreTest": {
    "reference": "REFERENCIA_RELATORIO_RESTAURO",
    "passed": false,
    "databaseBackupReference": "ID_DO_BACKUP_REAL",
    "attachmentBackupReference": "ID_DO_BACKUP_DE_ANEXOS"
  },
  "stagingValidation": {"reference": "REFERENCIA_TESTES_STAGING", "passed": false},
  "rollbackPlan": {"reference": "REFERENCIA_PLANO_REVERSAO"}
}
```

Não colocar credenciais, tokens ou URLs assinados nessa evidência. A verificação
exige hash e projeto corretos, referências e datas recentes (24 horas), e registo
de restauro/testes aprovados. **É uma barreira documental: não autentica por si só
que os backups existem ou que os testes foram realmente feitos.** Isso exige
inspeção dos serviços e relatórios, e permissões de publicação controladas.

## Verificação de dados antes/depois

`safety/data-inventory.sql` é exclusivamente de leitura e não é uma migração.
Executar numa base isolada restaurada primeiro. Devolve contagens e hashes por
empresa/tabela para comparação; não devolve o conteúdo individual dos documentos.
Durante atividade normal, alterações legítimas dos clientes mudam esses hashes.
Uma diferença exige análise, nunca um restauro automático de toda a base.

## O que ainda falta

Esta fase não torna a app pronta para venda. Permanecem os trabalhos de autorização
e quotas da IA, permissões finas no backend, isolamento do armazenamento entre
contas, anulação de faturas no servidor, durabilidade da fila pendente e proteção
dos módulos ainda baseados em snapshots. A infraestrutura de backups, alertas,
restauro e checks obrigatórios tem de ser confirmada/configurada no ambiente real.
