# Proposta: arquivo privado de originais

Estado: proposta separada, testada apenas em `marginflow-permissions-lab`. Não é uma migração histórica, não foi aplicada em produção e não constitui aprovação de publicação. As 44 migrações originais permanecem intactas.

## Código pronto e dependência de backend

O frontend usa a sessão autenticada normal e o bucket privado `marginflow-invoice-originals`. Sem a proposta (ou permissões equivalentes revistas), a fatura pode ser confirmada enquanto o original fica pendente de arquivo. Não inclui service role, URL pública ou fallback privilegiado.

`invoice-original-archive.sql` cria o bucket se não existir, recusa um bucket já público e acrescenta políticas de leitura/inserção e proteção contra atualização/eliminação dos novos originais. Não substitui tabelas nem altera registos de negócio. A chave determinística da associação usa a PK existente de `invoice_files`; nenhuma alteração de schema de faturas é necessária.

A leitura própria falhava no laboratório porque não existia uma política Storage que permitisse esse caminho ao utilizador autenticado. Os objetos e associações já existiam e eram legíveis pelo administrador local. A proposta habilita apenas os caminhos do novo bucket cujo segmento empresa/localização/fatura corresponde a uma fatura autorizada. A cláusula adicional `safety-invoice-attachments` destina-se exclusivamente aos objetos fictícios antigos deste laboratório; outros buckets históricos não são generalizados automaticamente.

## Permissões e limitações

O helper exige utilizador autenticado, membro ativo e localização válida, compatível com a localização da associação de membro. Owners podem aceder salvo recusa explícita. Outros papéis precisam de permissão explícita `invoices` e, para escrever, acesso edit/full e ação `import` permitida. Recusas explícitas são respeitadas. Isto é deliberadamente mais restrito do que inferir direitos a partir dos papéis frontend: não autorizar automaticamente General Manager/Head Chef/Bar Manager. O mapeamento completo desses papéis requer revisão antes de produção.

A proposta foi testada com os dois owners fictícios existentes, uma segunda sessão do owner da fatura, leitura cruzada recusada e bytes exatos. Não foram testadas todas as combinações de permissões personalizadas, localizações ou revogações durante um pedido. Antes de aplicação noutro ambiente, rever os grants e políticas Storage existentes: políticas permissivas mais amplas podem conceder acesso adicional. Não afirmar que estes testes aprovam todas as permissões da app.

## Aplicação reproduzível no laboratório

1. Confirmar que o destino é o laboratório fictício `marginflow-permissions-lab`, API loopback 55631, DB local 55632. Não usar uma connection string de produção.
2. Preservar os volumes e os dados existentes; não executar reset/reseed ou as migrações históricas novamente.
3. Aplicar uma vez, com erros fatais: `docker exec -i supabase_db_marginflow-permissions-lab psql -U postgres -d postgres -v ON_ERROR_STOP=1 < safety/proposals/invoice-original-archive.sql`.
4. Não repetir sobre uma instalação onde as políticas já existam: a transação falha em vez de remover/recriar políticas silenciosamente. Inspecionar a identidade da proposta já aplicada antes de continuar.
5. Usar a cópia isolada Vite e a IA simulada, arquivar faturas novas, descarregar os originais numa sessão nova e comparar bytes/associações. Testar erro entre objeto e associação e retry. As evidências desta execução estão no relatório de validação.

Para outro ambiente, converter esta proposta num procedimento de migração revisto, com verificação do destino, backups reais e decisão de release. Não colocar o SQL em `supabase/migrations` para contornar o guard atual nem fabricar uma aprovação de release.

## Recuperação e rollback

Objetos são imutáveis; retry usa o mesmo caminho e verifica SHA-256 dos bytes e metadados associados. Um objeto sem associação após falha parcial é conservado e concluído por retry; não existe varrimento global ou limpeza automática. Um PDF com várias faturas é preservado inteiro e associado aos documentos derivados, sem reconstrução.

As fontes ficam no IndexedDB de arquivo com chave utilizador/empresa/localização/fatura. O lote mantém também a fonte bruta no seu mecanismo de recuperação existente. Não se apagam fontes após sucesso. Se IndexedDB falhar, a mensagem exige manter a página aberta e conservar o ficheiro original: a memória deixa de existir ao fechar a página e não constitui backup. Não se garante retenção ilimitada pelo browser; conservar os ficheiros externos e aplicar a política real de backup de Storage/BD.

Reverter o código com `git revert` não elimina fontes, associações ou objetos. A versão fe4ea0a já consegue ler metadados e descarregar objetos quando as políticas permitem; não oferece o novo retry. Se for preciso suspender o novo arquivo, retirar apenas as permissões/políticas novas através de alteração revista; não apagar o bucket, tabelas ou ficheiros para desfazer esta etapa.
