# Brief – Report do menu e copiar receita (26 out 2026)

Fala com o Kevin em português. Segue `AGENTS.md` e `.ai/DATA_SAFETY.md`. Isto é só leitura e exportação: não altera dados.

## 1. Report do menu para download (para os patrões)
No Menu Costing há um botão **"Download report"** no menu ativo, com escolha de **PDF** ou **Excel**. O conteúdo:
- **Cabeçalho:**
  - nome do restaurante;
  - nome do menu e datas;
  - data do report;
  - GP alvo;
  - "Preços com IVA 20%; GP calculado sobre o preço sem IVA";
  - base de preço usada (última fatura ou média 4 semanas).
- **Resumo:**
  - número de pratos;
  - GP médio do menu (simples, sem mix de vendas);
  - pratos abaixo do alvo;
  - custo médio por prato.
- **Tabela por categoria:** prato, preço com IVA, preço net, custo, GP %, alvo, diferença e o preço sugerido para o alvo.
  - Os pratos abaixo do alvo vêm a vermelho ou âmbar.
  - Subtotal (GP médio) por categoria.
- **Opcional (caixa "Incluir detalhe"):** uma página por prato com os ingredientes (quantidade, unidade, custo) e o fornecedor.
- **Rodapé:** linhas com preço manual ou com pesos estimados, para quem lê saber o que é estimativa.
- O PDF tem de ficar bem em A4 e ser legível no telemóvel. O Excel leva os números como números, não como texto.

## 2. Copiar receita para o recipe book da equipa
O Kevin mantém um recipe book no Google Docs. Formato por receita:

```
Apple, caper & lovage dressing
30g lovage, finely chopped
100g capers, roughly chopped
1 Granny Smith apple, finely diced
200ml olive oil
...
Method
Mix the cider vinegar and sugar until the sugar has dissolved. ...
```

- No editor e na lista de receitas, botão **"Copy for recipe book"**. Copia para a área de transferência:
  - o nome (como título);
  - os ingredientes, um por linha, "quantidade+unidade nome" (por exemplo "220g soy milk", "1 lemon");
  - "Method" e o método.
  - Para Google Docs, copiar como texto formatado (HTML: título a Heading, lista simples) e também como texto simples.
- Os ingredientes usam o **nome de cozinha**, não o do fornecedor ("olive oil" e não "Oil, Olive Extra Virgin 5lt").
  - Adicionar à linha um campo opcional "nome na receita". Se estiver vazio, usar o nome do produto limpo: tirar a marca e o tamanho entre parênteses e inverter "Oil, Olive" → "olive oil".
- Mostrar o rendimento ("Makes 1.6kg" / "Serves 4"). Os custos não aparecem no texto copiado (é para a equipa).
- Extra: **"Download recipe book"** com todas as receitas ativas, em ordem alfabética, num DOCX ou PDF.

## Verificar
- Testes do formato copiado com uma receita real, por exemplo "Vanilla Mascarpone".
- O report do menu "October 2026 – Evening" bate com os números do ecrã.
- `npm test`, `npm run safety:check`, `npx vite build`. Mostrar o plano ao Kevin antes.
