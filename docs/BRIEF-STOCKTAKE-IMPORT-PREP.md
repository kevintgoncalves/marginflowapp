# Brief – Stocktake: import do Excel do Kevin e prep (26 out 2026)

Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`: os stocktakes que existem não podem ser alterados. Não usar o ficheiro real do Kevin nos testes: criar casos equivalentes, como os exemplos abaixo.

## Como o Kevin conta hoje
- É um Excel simples: coluna A com o produto escrito à mão, B com a quantidade e C com a unidade.
  - Unidades: g, kg, lt, ml, uni, box, bx, punnet(s), tin, "A10 tins", trays, packs, bunchs, loaf.
  - Às vezes vem o tamanho da embalagem na unidade ("325g", "250g", "60z") ou no nome ("Honey 3.17kg", "Brandy 75cl").
  - O cabeçalho é "Product | Qty | uni".
- Nas colunas G/H há **estimativas de prep por zona**: Prep, Pantry £130, Desserts £20, Pantry freezer £50, big fridge £50, Big fridge outside £50, Small fridge outside £30, Big freezer £150, back kitchen £10.
- Hoje ele manda o Excel ao ChatGPT para fazer o match com o Excel da app e depois importa. Quer mandar o Excel diretamente para a app.

## Teste feito com o import atual (`parseStocktakeImportRows`)
Corri o import sobre o Excel real, com os 609 produtos ativos, sem gravar nada. Das 221 linhas:
- 59 confirmadas (23 exact + 36 alias), ou seja só 27% automático;
- 62 sugeridas por fuzzy, em que algumas estão erradas:
  - "Premium cumberland sausage" → Herbs, Sage;
  - "Horseradish cream" → Radish;
  - "Hasbrown" → Cake, Banana Loaf;
  - "Ground ginger" → Ginger fresco;
- 48 ambíguas: "Pistachios", "Feta", "Chorizo", "Mint", "Basil", "Buttermilk";
- 52 sem match.

## Problemas, por impacto
1. **A quantidade é tratada como número de embalagens.** "Pistachios 1.727 kg" seria 1.727 caixas, e "White sesame 1913 g" seriam 1913 embalagens. A coluna "uni" nem é lida, porque o cabeçalho reconhecido é "Unit".
   - A app tem de converter a quantidade e a unidade em embalagens, usando o conteúdo da embalagem do produto: `recipeConversion`, `normalizedUnit` ou packSize (a mesma lógica de `recipeCosting.js`). Exemplos:
     - 5.795 kg de açúcar com embalagem 2 kg = 2.9 embalagens;
     - "3 × 325g" de agave = 3 embalagens;
     - "0.8 uni" de Honey 3.17kg = 0.8 embalagem;
     - "2 A10 tins" = 2 latas.
   - Também ler "uni", "qty unit" e similares como coluna de unidade.
   - Se a conversão não for possível, a linha fica a pedir "1 embalagem = …", como nas receitas.
2. **Erros de escrita bloqueiam o match:** "Mustard seeeds", "Cumin seeeds", "Whole bnlack peppercorn", "Poatoes", "Smoked salmond", "worcerter sauce". Falta tolerância a erros por caracteres (trigramas ou Levenshtein) além da que já existe por palavras.
3. **O tamanho no nome atrapalha:** "Honey 3.17kg", "Brandy 75cl", "Soy sauce 1lt", "Maldon salt 1.4kg", "Colmans wholegrain mustard 2.25lt". É preciso tirar o tamanho antes de comparar o nome e usá-lo para escolher a embalagem certa. O mesmo para o fornecedor no nome ("Limes albion", "Focaccia Albion").
4. **Ambíguos óbvios.** Desempatar por:
   - o departamento do stocktake;
   - o produto comprado mais recentemente ou mais vezes nos últimos 60 dias;
   - a unidade da linha (g → produto ao kg; "punnet" → produto em punnet).
5. **A app não aprende.** Quando o Kevin confirma "Hasbrown" → Potatoes, Hash Brown Triangles, a escrita dele tem de ficar guardada como alias desse produto (alias por empresa). No mês seguinte deve dar quase 100% automático. Esta é a melhoria com mais retorno.
6. **Fallback com IA**, como ele fazia com o ChatGPT, para as linhas que continuam sem match ou ambíguas depois de 1–5:
   - mandar à IA a linha mais as 10 melhores candidatas (nome, embalagem, fornecedor), nunca o catálogo inteiro;
   - a IA devolve o id escolhido ou "nenhum" e uma confiança;
   - fica sempre como "sugerido" para rever, nunca é aplicado sem confirmação.
   - Usar o mesmo serviço de IA que o import de faturas já usa.
7. **Valores impossíveis:** "Squid 1576 kg" (era g) e "brighton blue 1632 kg". Avisar quando o valor da linha for maior que um limite, por exemplo mais de 10× a compra média, ou quando a quantidade em kg for muito acima do habitual.
8. **Linhas repetidas** (Feta, Buttermilk, Table salt, Icing sugar e Burrata aparecem duas vezes, de zonas diferentes): somar e mostrar "2 linhas".
9. **Produtos que nunca vieram numa fatura:** Semolina, Gochujang, Xanthan gum, Yuzu seasoning, Silken tofu, Rye bread, Golden syrup, charcutaria (Pirata loin, Rebel copa, Rebel bresaola). Dar três opções:
   - criar o produto com preço manual;
   - ligar a um produto existente;
   - ignorar.
   - Mostrar a lista no fim, para o Kevin decidir de uma vez.

## Prep no stocktake (pedido do Kevin)
Hoje não há maneira de contar prep. Adicionar dois tipos de linha ao stocktake, tanto na contagem ao vivo como no import:
- **Receita:** "Dukkah 633 g", "Black berry purée 1 kg", "Chilli jam 2 kg". O valor é a quantidade × o custo da receita por kg, l ou porção (`recipeCosting.js`, preço atual). No import, procurar também nas receitas, como no editor de receitas.
- **Valor manual por zona:** "Big freezer – prep £150".
  - No import, ler as colunas G/H (zona e valor) quando existirem, ou um bloco "Prep estimates".
  - Fica marcado como estimativa, com o departamento.
- O total do stocktake mostra separado: produtos, prep por receita e prep estimada.

## Ecrã de revisão do import
- Uma lista com filtros: Tudo, Confirmado, Rever, Sem match, Valores estranhos.
- Cada linha mostra o texto original ("Groung almonds 1.649 kg"), o produto escolhido (com fornecedor e embalagem), a quantidade convertida ("0.66 × 2.5kg") e o valor.
- Trocar de produto com pesquisa. Ao confirmar, guardar o alias.
- "Confirmar todos os sugeridos com confiança ≥ X" para ser rápido.
- Funciona no telemóvel.

## Verificar
- Testes com casos inventados que cubram os problemas 1–9: unidades, erros de escrita, tamanho no nome, ambíguos, alias aprendido, valores impossíveis, linhas repetidas, receita e valor manual.
- Ver com o Kevin o número de matches automáticos antes e depois. Ele tem o ficheiro real; a meta é mais de 80% à primeira e mais de 95% no mês seguinte com os aliases.
- `npm test`, `npm run safety:check`, `npx vite build`. Mostrar o plano ao Kevin antes de escrever código.
