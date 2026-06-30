# MarginFlow — AI & Contributor Onboarding

> Lê este documento antes de qualquer outro.
> É o ponto de entrada para qualquer IA ou colaborador humano que vai trabalhar neste projeto.

---

## O que é o MarginFlow?

MarginFlow é uma plataforma de gestão operacional para o sector da hospitalidade (restaurantes, cafés, bares, hotéis, grupos multi-site).

Substitui folhas de cálculo dispersas e sistemas desconectados por um único ecossistema operacional que centraliza:

- Compras e fornecedores
- Faturas e linhas de fatura
- Produtos e preços
- Receitas e custo de produção
- Vendas e performance comercial
- Stocks e inventário
- Labour (mão de obra)
- Relatórios e GP

**Ideia central:** cada módulo cria, enriquece, valida ou consome dados operacionais partilhados. Nenhum módulo existe em isolamento.

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite |
| Estilos | CSS customizado (`src/styles.css`) |
| Ícones | Lucide React |
| Backend / Base de dados | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| PDF / OCR | pdfjs-dist + Anthropic API (Claude) |
| Deploy | Vercel |
| Armazenamento local | localStorage (fallback quando Supabase não está configurado) |

**Nota importante sobre a arquitectura actual:** toda a lógica de negócio e todos os componentes vivem actualmente em `src/main.jsx` (≈10 000 linhas). Este ficheiro é o núcleo da aplicação. A modularização está planeada para o futuro.

---

## Estrutura de ficheiros

```
MarginFlow work edition/
│
├── src/
│   ├── main.jsx              ← Toda a aplicação (componentes + lógica)
│   ├── styles.css            ← Todos os estilos
│   ├── labourSeedData.js     ← Dados de seed para labour
│   └── lib/
│       └── supabase.js       ← Cliente Supabase
│
├── api/
│   └── read-invoice-ai.js   ← Serverless function (Vercel) para processar faturas com IA
│
├── docs/                     ← Especificação funcional oficial
│   ├── 00 Core/              ← Visão geral, arquitectura, navegação
│   ├── 01 Modules/           ← Documentação de cada módulo
│   ├── 02 Database/          ← Modelo de dados e fluxo
│   ├── 03 AI/                ← OCR, leitura de faturas, product matching
│   ├── 04 UI/                ← Design system, componentes, cores
│   ├── 05 API/               ← Integrações externas
│   ├── 06 Business Rules/    ← Regras de negócio transversais
│   └── 07 Roadmap/           ← Ideias, changelog, roadmap
│
├── .ai/                      ← Contexto estruturado para assistentes de IA
│   ├── AI_ONBOARDING.md      ← Este documento (copia para aqui)
│   ├── PROJECT_CONTEXT.md    ← Porquê existe o MarginFlow
│   ├── PROJECT_PRINCIPLES.md ← Princípios permanentes de desenvolvimento
│   ├── SESSION_PROMPT.md     ← Prompt de início de sessão (a preencher)
│   ├── BUSINESS_RULES.md     ← Regras de negócio (a preencher)
│   ├── CODING_RULES.md       ← Regras de código (a preencher)
│   └── UI_GUIDELINES.md      ← Guia de interface (a preencher)
│
├── .specs/                   ← Especificações em discussão
│   ├── draft/                ← Rascunhos
│   ├── approved/             ← Aprovadas (prontas para implementar)
│   └── archived/             ← Arquivadas
│
├── .templates/               ← Templates reutilizáveis
│   ├── feature-spec-template.md
│   ├── module-template.md
│   ├── database-table-template.md
│   └── ai-session-template.md
│
├── supabase/
│   ├── migrations/           ← Migrações de base de dados
│   ├── seed.sql              ← Dados iniciais
│   └── config.toml           ← Configuração Supabase
│
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

---

## Módulos da aplicação

A navegação principal reflecte o fluxo operacional da plataforma:

```
Dashboard → Sales → Invoices → Suppliers → Products → Recipes → Stock → Labour → Reports → Settings
```

### Fluxo de dados entre módulos

```
Suppliers
    ↓  (fornecem contexto comercial)
Invoices
    ↓  (criam linhas de fatura)
Invoice Lines
    ↓  (geram / actualizam)
Products  ←──────────────────────────┐
    ↓  (são ingredientes de)         │
Recipes                              │ (preços actualizados)
    ↓  (determinam custo teórico)    │
Sales ───────────────────────────────┘
    ↓  (validado por)
Stock
    ↓  (combinado com)
Labour
    ↓  (consolidado em)
Reports
```

### Responsabilidade de cada módulo

| Módulo | Cria | Consome |
|---|---|---|
| Suppliers | Fornecedores, horários de entrega | — |
| Invoices | Faturas, linhas de fatura, credit notes | Suppliers, Products |
| Products | Produtos com preços por fornecedor | Invoices, Suppliers |
| Recipes | Receitas, menus, custo de porção | Products |
| Sales | Registos de vendas | Recipes |
| Stock | Stocktakes, waste | Products, Invoices |
| Labour | Registos de labour por dia | Sales |
| Reports | Dashboards, GP, análises | Tudo |

---

## Modelo de dados principal

Entidades centrais e as suas relações:

```
suppliers           (id, name, delivery_schedule, ...)
    └─── invoices   (id, supplier_id, date, status, total, ...)
             └─── invoice_lines (id, invoice_id, product_id, qty, price, ...)

products            (id, name, unit, department, ...)
    └─── supplier_prices (product_id, supplier_id, price, ...)
    └─── recipe_ingredients (recipe_id, product_id, qty, ...)

recipes             (id, name, portions, cost, ...)
    └─── menus      (id, name, items, selling_price, ...)

sales               (id, date, revenue, covers, ...)
stocktakes          (id, date, items[], ...)
waste_items         (id, date, product_id, qty, reason, ...)
labour_data         (id, date, cost, hours, department, ...)
```

**Estado actual:** os dados são guardados em `localStorage` com sincronização opcional para Supabase. As chaves de localStorage seguem o padrão `marginflow.<módulo>`.

---

## Fluxo de IA (Invoice Processing)

A funcionalidade de IA é um dos pontos centrais do produto:

1. Utilizador faz upload de PDF/imagem de fatura
2. `pdfjs-dist` extrai texto do PDF
3. Texto é enviado para `api/read-invoice-ai.js` (Vercel serverless)
4. Essa função chama a API da Anthropic (Claude) com um prompt estruturado
5. Claude devolve JSON estruturado: fornecedor, número, data, linhas de fatura
6. O utilizador revê e aprova antes de qualquer dado ser guardado
7. Produtos são matched contra o catálogo existente ou criados como novos

**Princípio chave:** a IA nunca aprova automaticamente. O utilizador confirma sempre.

---

## Princípios que nunca mudam

Antes de implementar qualquer coisa, responde a estas perguntas:

1. **Resolve um problema real de hospitalidade?**
2. **Reduz trabalho manual?**
3. **Preserva a integridade dos dados?**
4. **É consistente com o resto da plataforma?**
5. **Vai escalar sem redesenho?**

Se a resposta a qualquer uma for "não", reconsiderar antes de avançar.

---

## O que a IA deve e não deve fazer

**Deve:**
- Seguir a documentação como especificação autoritária
- Propor melhorias quando relevante
- Distinguir claramente entre funcionalidade existente e propostas futuras
- Perguntar quando há ambiguidade em vez de inventar

**Não deve:**
- Inventar funcionalidade não documentada
- Aprovar faturas ou dados financeiros automaticamente
- Duplicar entidades que já existem (ex: criar produto duplicado)
- Ignorar as regras de negócio documentadas em `docs/06 Business Rules/`

---

## Como iniciar uma sessão de trabalho

Para qualquer sessão de desenvolvimento, ler por esta ordem:

1. Este documento (`AI_ONBOARDING.md`)
2. `.ai/PROJECT_CONTEXT.md` — porquê existe o produto
3. `.ai/PROJECT_PRINCIPLES.md` — princípios permanentes
4. O documento do módulo relevante em `docs/01 Modules/`
5. As regras de negócio aplicáveis em `docs/06 Business Rules/`

Se existe um `.specs/approved/` relevante para a tarefa, ler também.

---

## Estado actual do projecto (Junho 2026)

- A aplicação está funcional e deployada em Vercel
- Toda a lógica está em `src/main.jsx` (monolítico, modularização planeada)
- Supabase está configurado mas o uso de localStorage é o fallback
- Os ficheiros `.ai/` estão parcialmente preenchidos (este é o documento de onboarding)
- Vários ficheiros em `docs/` ainda estão vazios (em progresso)
- `.specs/` e `.templates/` estão estruturados mas a ser populados

---

## Documentos relacionados

- `docs/00 Core/Project Overview.md` — visão geral detalhada
- `docs/00 Core/Architecture.md` — arquitectura técnica
- `docs/00 Core/Navigation.md` — estrutura de navegação
- `docs/02 Database/Data Flow.md` — fluxo de dados entre módulos
- `.ai/PROJECT_CONTEXT.md` — contexto estratégico
- `.ai/PROJECT_PRINCIPLES.md` — princípios de desenvolvimento
