# Verificação em produção – 28 out 2026

Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`.

## OK
- Carregamento da cloud corrigido (6ab9c05):
  - 38 receitas e os menus de outubro aparecem;
  - o aviso "Cloud records could not be verified" desapareceu;
  - os dados da cloud estão intactos (recipes rev 33, products rev 213).
- Dashboard: compras e GP iguais a antes (Kitchen Made 70.2%). O GP de stock mostra "Not available" com o motivo.

## Problemas encontrados (por gravidade)
1. **A "média de 4 semanas" dá preços muito abaixo do real**, quase sempre nos produtos com "2 ou 3 suppliers". Com isso, os custos das receitas e dos pratos baixaram 30–70% sem razão. Exemplos (média da app vs. última fatura):
   - Sugar, Caster: "2 suppliers · x2KG · £0.42/kg" vs £1.10/kg (Woods 2kg £2.21);
   - Pears, Conference: £2.28/kg vs £4.40/kg (TG KILO);
   - Beans, Butter (tin 2.5kg): £0.44/kg vs £1.43/kg;
   - Garlic, Peeled: "3 suppliers · X1KG · £2.75/kg" vs £5.50/kg;
   - Spice, Pepper Black Cracked: £4.08/kg vs £13.76/kg;
   - Waffles Liège: o sweet waffle passou de £3.27 para £1.93 de custo.
   - Provável causa: a média junta compras de fornecedores ou embalagens diferentes sem converter cada compra pela sua própria embalagem, por exemplo usando a quantidade comprada em vez do conteúdo total.
   - Regra: £/kg da média = Σ(valor de cada linha) / Σ(quantidade × conteúdo da embalagem **dessa linha**), com a resposta caixa/unidade e a `recipeConversion` aplicadas a cada linha. Excluir linhas sem conversão confirmada.
   - No ecrã, um clique na linha deve mostrar as compras usadas.
   - Testes com estes casos.
2. **"Case or item?" assume "per case" por defeito.** Exemplo: Spice, Cinnamon Sticks Elite 6 x 150G £3.15 dá £3.49/kg; por item seria £20.97/kg, que é o realista. Enquanto não houver resposta, a linha deve ficar "a confirmar" e não usar uma das opções sem avisar. Ou escolher a mais plausível (£/kg dentro do intervalo típico da categoria) e marcá-la como suposição.
3. **Formato:** "Per g £0.00" (Burger Mustard, Butter Bean Purée, Gravlax). Mostrar por kg ou l quando o valor por g é menor que £0.01.
4. **Learning:** o aviso "31 reusable match or conversion update(s) await confirmation" agora mostra o erro "Select an active company department for this line before synchronising". Mostrar quais são as 31 linhas e deixar o Kevin escolher o departamento (ou aplicar o departamento do produto), em vez de ficar parado.
5. **Velocidade:** o Invoice GP do Dashboard fica "Loading…" cerca de 20 s depois de abrir.
6. **Labour:** a página abre em "Jun 2026" com £0.00 e 0 horas, mas o Dashboard mostra Labour 1.2%. Confirmar o mês por defeito (o atual) e de onde vêm os dados. O Kevin vai testar com o Excel do service charge.
