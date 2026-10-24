# Sistema de sales da MarginFlow – opinião e melhorias (24 out 2026)

## Corrigido hoje (publicado)
- `78ac985`:
  - Gravar um dia no "Input sales" substitui todas as entradas desse dia, incluindo entradas antigas fora do período carregado.
  - Ao escolher um dia fora do período carregado, o formulário carrega o que está gravado.
- `f8e35ef`:
  - Cada gravação reescrevia **todos** os dias carregados, às vezes com valores antigos.
  - Agora só grava o dia alterado e ignora releituras desatualizadas.

## O que está bem
- Um registo por dia com divisão por departamento (Kitchen Made, Bought In, Bar).
- Net e gross separados.
- Service charge fora das vendas do GP.
- Comparações com a semana e o ano anteriores.

## Problemas e melhorias (por prioridade)
1. **Integração direta com o Square (OAuth)**, para acabar com a introdução manual.
   - Importar todos os dias as vendas por reporting group / categoria, o service charge (com tips), os descontos e os refunds.
   - Voltar a sincronizar os últimos 7 dias, porque o Square ajusta refunds e tips depois.
2. **Mapeamento categoria → departamento nas Settings**, por exemplo Drinks → Bar e Food - Make in → Kitchen Made.
   - Regra para eventos e depósitos (Other) com uma % por departamento definida pelo utilizador, ou "não alocado".
3. **Mostrar o "não alocado"** no ecrã Sales: os departamentos somam £814,775, mas o total é £839,552.
4. **Restrição na base de dados:** uma única entrada por empresa, local e data.
5. **Service charge → labour (versão paga)** – fica para depois. Hoje o 40/60 está fixo no código (main.jsx ~5413, ~15810, ~16522).
6. **Limpar código morto:** o SalesManager (import CSV antigo) já não está no ecrã.
7. **Mais dados do Square:** transações e covers, vendas por hora, comps e descontos.

## Decisão do Kevin
- O service charge **inclui as tips**. O Square dá "Tips and service charges" juntos.
- Os departamentos são criados pelo utilizador; o mais comum será "Food" e "Wet".
- O Kevin só pode testar o Square. Os outros sistemas vão pelo CSV genérico.
