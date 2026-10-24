# Brief – Recipes e Menu Costing (revisão de 24 out 2026)

Revisto em produção com a conta do Kevin (Reading Room Brighton) e no código (`src/main.jsx`: `Recipes` ~14328, `MenuCosting` ~14569, `recipeBatchCost`/`recipeUnitCost`/`dishCost`/`gpFor` ~3863).
Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`: não se perde nenhuma receita, prato ou menu que já exista.

## Estado em produção
- 1 receita: "Mushrooms on Toast Base".
- 2 menus.
- Tudo está no blob `marginflow_cloud_state` (`recipes`, `menus`). As tabelas `recipes`, `recipe_ingredients`, `menu_items` e `menu_item_components` existem, mas estão vazias.
- A receita tem 2 ingredientes, ambos com `productId: ""`, ou seja, sem ligação a nenhum produto. Têm o preço escrito à mão (TG Fruits £8.90, Coburn & Baker £1.16).

## Problemas encontrados (por gravidade)
1. **O custo não tem unidades.**
   - Linha = `quantity × unitCost`, em que `unitCost` é o preço da embalagem (caixa ou saco). O campo "Unit" é texto livre e não entra no cálculo.
   - Exemplo: 150 g de cogumelos de uma caixa de 2,5 kg custam a caixa inteira, a não ser que o utilizador calcule 0,06 à mão.
   - Os produtos já têm o necessário: `packSize`, conteúdo por unidade de compra, unidade de comparação kg/l/each e £/kg. Ver `src/domain/purchaseUnits.js` e o "£14.50/kg" que o editor de faturas já mostra.
2. **Os preços ficam congelados.**
   - O `unitCost` de cada ingrediente é copiado quando se grava.
   - Quando chega uma fatura com o preço novo, nem a receita nem o prato mudam.
   - O prato também guarda o custo da receita no momento em que foi adicionado (`lineCost`), por isso alterar a receita não altera o prato.
3. **O GP do menu é calculado sobre o preço com IVA.**
   - `gpFor(cost, sellingPrice)` usa o preço tal como está escrito, e os preços de menu no Reino Unido incluem 20% de IVA.
   - Exemplo: um prato de £12 com custo de £3 aparece com 75% de GP; o real é 70% (£10 net).
   - O "Food GP %" do menu sai inflacionado e não é comparável com o GP do Dashboard, que é sobre o net.
4. **Os ingredientes não ficam ligados aos produtos.**
   - A ligação só acontece quando o nome escrito é **exatamente** igual ao do produto. Com 855 produtos com nomes de fornecedor ("Mushrooms, Chestnut", "Salad, Watercress"), escrever "Chestnut Mushrooms" não liga.
   - Aparece "Create Product", que cria um **produto duplicado** com o preço escrito à mão.
   - A pesquisa tem de procurar por palavras e aliases e mostrar o fornecedor, a embalagem e o £/kg.
5. **Não dá para editar um prato.** Na tabela do menu só há apagar; para mudar um preço é preciso apagar e criar de novo.
6. **No telemóvel** (largura de cerca de 340 px), a tabela de ingredientes corta as colunas: Supplier, Unit cost, Quantity, Unit e Cost só aparecem com scroll horizontal. Ver a captura do "Edit recipe".
7. Não há sub-receitas dentro de receitas: um molho ou uma base não podem ser ingrediente de outra receita, só de um prato. Também não há perdas (yield %) por ingrediente, por exemplo descascar ou aparar.

## Proposta (simplificar)
**Uma linha de ingrediente = produto ou receita + quantidade + unidade (g, kg, ml, l, each).**
- A pesquisa procura nos produtos **e** nas receitas, com pesquisa por palavras e aliases. Cada sugestão mostra "TG Fruits · 2.5kg · £3.56/kg".
- Custo da linha = quantidade convertida × £/kg (ou £/l, £/each) **do preço atual** do produto, ou seja, a fatura mais recente.
  - Se o produto não tiver a conversão confirmada, mostrar "Confirmar conversão" na própria linha, com o mesmo controlo do editor de faturas, em vez de usar o preço da embalagem.
- Perda/rendimento % opcional por linha.
- Receitas e pratos guardam **referências** (`productId`/`recipeId`, quantidade, unidade), não custos. O custo é sempre calculado na hora.
  - Mostrar "custo subiu X% desde [data]" quando o preço muda.
- **Prato:** nome, categoria, preço de venda **com IVA**, taxa de IVA (por defeito a das Settings, 20%) e os mesmos ingredientes.
  - O GP é calculado sobre o preço sem IVA. Mostrar "Preço net £10.00 · Custo £3.00 · GP 70%".
  - Opcional: preço sugerido para atingir o GP alvo.
- **Editar o prato** com o mesmo ecrã de criar.
- Num ecrã estreito, a linha de ingrediente passa a cartão (nome em cima; quantidade, unidade e custo em baixo).
- Ecrã do menu: lista dos pratos com custo, preço, GP e alvo, ordenável por GP, e um aviso nos pratos abaixo do alvo ou cujo custo subiu.

## Migração dos dados existentes (não perder nada)
- Converter a receita e os pratos existentes para o novo formato **sem apagar o original**. Guardar o JSON antigo, por exemplo em `legacy`.
- Ingredientes sem produto ficam como "linha manual" com o preço que tinham e um aviso "ligar a produto".
- Se mudar de blob para tabelas relacionais, seguir as regras de migração do repositório: review, teste e registo em `safety/reviewed-additive-migrations.json`. O Kevin aplica a migração em produção.

## Como verificar
- Testes unitários com casos reais:
  - caixa de 2,5 kg a £8.90 → 150 g = £0.53;
  - case de 24×500 ml a £5.53 → 250 ml = £0.12;
  - prato de £12 com IVA e custo £3 → GP 70%.
- Ao carregar o preço de uma fatura nova, o custo da receita e o do prato mudam sem gravar nada.
- Num ecrã de telemóvel, criar uma receita sem scroll horizontal.
- `npm test`, `npm run safety:check`, `npx vite build`. Mostrar ao Kevin antes de publicar.
