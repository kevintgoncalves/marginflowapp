# MarginFlow v5 — matches e comparação de compras

Data: 28 setembro 2026. Implementação em `staging-import-products-v5/app`, baseada na cópia v4. Os 341 ficheiros originais foram comparados com os SHA-256 registados e permanecem intactos. As 44 migrações originais não foram alteradas; nenhuma migração nova foi aplicada. Não houve publicação nem acesso à base de produção.

## Causas encontradas e alterações

- O match explícito só era persistido ao confirmar/importar a fatura. A seleção no upload individual, no lote e no editor de revisão do Invoice Control Centre agora chama a RPC existente imediatamente. Só após um identificador relacional válido considera a regra gravada e a propaga. Falhas mantêm a seleção na fatura e mostram um aviso com instrução de retry.
- Processamento em curso usava regras capturadas no início. A conclusão consulta as regras atuais; alterações confirmadas atualizam os rascunhos compatíveis, os contadores do lote e documentos locais pendentes sem versão financeira confirmada.
- A leitura relacional não paginava. Agora usa páginas contadas, identificadores únicos e consultas relacionadas em grupos de 100; respostas incompletas falham sem serem convertidas numa lista vazia.
- Matches por código ignoravam mudanças de pack. Packs incompatíveis ou decisões concorrentes diferentes pedem revisão. IDs de produtos inexistentes não se tornam matches fictícios.
- “Only this invoice” e escolhas manuais ficam protegidas da propagação. Faturas sincronizadas/confirmadas/importadas são excluídas.
- Preserva-se a descrição original ao selecionar o nome canónico. Quantidade e preço não integram a identidade da regra.
- O editor distingue embalagem de unidade faturada. A confirmação usa os campos existentes de pack/unidade da regra. Packs em kg/g/l/ml e unidades individuais têm conversão; valores desconhecidos são excluídos da comparação. Uma linha por kg não volta a ser dividida pelo peso da embalagem.

## Produtos e exportação

Novo painel de comparação por produto canónico: filtros de período, fornecedor, categoria e revisão; volume comparável, gasto registado, média ponderada, melhor preço observado/data, indicação de fornecedor único e poupança hipotética sobre o volume comparável. O detalhe inclui fornecedor/código, descrição original, pack, preço faturado/normalizado, data e acesso à fatura. Identifica a última compra de cada artigo do fornecedor pela data de compra.

A entrada financeira vem exclusivamente da coleção confirmada relacional. Não usa preços de rascunhos, preços correntes editados no catálogo ou dados demo como compras confirmadas. Não mistura moedas/unidades incompatíveis e não usa créditos/devoluções como preço mínimo. Produtos canónicos diferentes não são agrupados automaticamente como equivalentes.

Exportações CSV selecionadas: comparação interna e pedido de cotação em inglês. O pedido omite por defeito fornecedores concorrentes/preços; permite inclusão explícita. Tem referência estável, especificação disponível, pack, volume/período e campos em branco para código, embalagem proposta, preço, validade e notas. Exclui produtos identificados como prep/receita. Protege células contra execução de fórmulas em folhas de cálculo.

## Resultados comprovados

| Camada | Resultado | Limite |
| --- | --- | --- |
| `npm test` | 330 testes passaram; zero falhas/skips | Dados sintéticos |
| `npm run safety:check` | Passou; 44 migrações originais intactas | Não comprova controlos de produção |
| `npm run build -- --mode staging` | Passou | Aviso existente de chunks superiores a 500 kB |
| Integração JS | RPC simulada + adapter + fila assíncrona + validação real: 10 pendentes ready, zero imports | Não é HTTP/Supabase remoto |
| Paginação | 1.201 regras; resposta ausente recusada | Cliente de teste |
| Reutilização | Nova importação/reabertura, preço diferente, pack diferente, conflito, exceção manual, retry | Unitário/integração local |
| Conversões/comparação | 2 sacos × 3 kg a £8,18: £16,36 / 6 kg; packs 3/5 kg; custo por kg não dividido duas vezes; média ponderada; moedas incompatíveis; créditos; CSV | Dados sintéticos |
| Browser local | Seleção, detalhe, filtros/seleção/exportação; unidade bag; match sem backend mostra falha de confirmação; “Only this invoice”; sem erros de consola nos fluxos observados | Modo demo, sem sessão Auth real |
| PostgreSQL local real | RPC v2 gravou e confirmou a regra; retry conservou ID; nova sessão releu pack/unidade/source; utilizador sem pertença não leu nem gravou | Base isolada; role authenticated com identidade fictícia por sessão SQL; não é login HTTP |
| PostgreSQL → aplicação | Regra realmente relida passou pelo adapter e resolveu dez pendentes na fila; contadores ready=10/imported=0; rascunho posterior/reaberto fez match | Integração Node, não browser autenticado |
| Staging remoto | **Pendente** | Domínio protegido pela Vercel; associação ao Supabase ainda não confirmada |

## Ambiente local de base de dados

O Docker usa um socket Unix local. O contentor `supabase_db_marginflow` tem identidade `com.supabase.cli.project=marginflow`, correspondente à configuração do repositório, e PostgreSQL 17.6. A sua base original **não foi usada como dataset de testes**.

Foi criada `mf_v5_matches_20260928_b`, a partir de um dump **apenas de estrutura**, com ownership/ACLs, e depois inseridas fixtures fictícias. Não foram copiados utilizadores, empresas, compras, stocks ou anexos reais. O restauro da estrutura foi transacional. A primeira tentativa, `mf_v5_matches_20260928`, falhou por ownership antes dos testes; ficou separada, sem fixtures de negócio. Ambas as bases criadas para este ensaio permanecem locais; não se apagou qualquer base existente.

O dump de estrutura e esta cópia de código **não são um backup de dados ou anexos**. Scripts/resultados estão em `validation/`. Os testes gravaram apenas regras e referências fictícias na base nova; não criaram compras.

## O que falta validar / limitações concretas

1. Identificar no deployment Vercel qual o Supabase associado a `https://staging.marginflow.co.uk`, confirmar que é de testes e disponibilizar uma sessão autorizada de staging. O `.env` da raiz não foi usado: não havia prova da sua associação a staging. O utilizador está a identificar o projeto Vercel.
2. Repetir o fluxo completo no browser autenticado de staging: seleção → RPC → outras faturas pendentes → reload/logout/login → nova importação. Testar duas sessões/empresas, interrupções e extração AI real.
3. A RPC v2 existente serializa decisões na aplicação desta sessão, mas não introduz neste patch um protocolo novo de conflitos entre dispositivos nem histórico imutável de cada revisão de conversão. Mantém o comportamento de atualização/supersessão do backend existente. Esses controlos não devem ser considerados resolvidos por estes testes.
4. A gravação imediata está ligada aos editores de upload individual, revisão do lote e revisão no Invoice Control Centre. Alterar uma regra não confirma nem grava alterações financeiras da fatura aberta; essas alterações continuam a exigir a confirmação da própria fatura.
5. A comparação exige produto canónico associado e unidade/pack suficientes. Não aprova automaticamente alternativas de marca/especificação nem transforma dados legados ambíguos em equivalências. Um fluxo dedicado de aprovação de equivalências entre produtos canónicos diferentes continua fora desta entrega.
6. Backups frescos de produção, restauro de anexos, reconciliação, permissões/auditoria completas e rollback que preserve escritas posteriores continuam por verificar. Não foi autorizada nem executada uma release de produção.

## Revisão e recuperação

A pré-visualização local está em `http://127.0.0.1:5203/?demo=true&page=products`. É demonstração da interface; não é a aplicação remota de staging.

Para regressar à interface anterior, usar a cópia v4 intacta. Esta entrega não exige reset nem rollback de bases de clientes. Não restaurar uma base de dados como rotina para desfazer uma mudança de UI. O inventário das alterações está em `changed-files.json`; os hashes originais, em `original-hashes.json`.
