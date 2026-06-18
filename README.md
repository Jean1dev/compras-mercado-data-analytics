# compras-mercado-data-analytics

Leitor de cupom fiscal: recebe o caminho de uma imagem de cupom de supermercado, extrai os produtos via Claude (visão computacional, usando LangChain.js), classifica cada item e persiste no MongoDB. O objetivo é acumular histórico de compras para analisar inflação pessoal, comparar preços entre estabelecimentos e identificar padrões de consumo.

## Stack

- Node.js + TypeScript (strict, ESM)
- [LangChain.js](https://js.langchain.com/) (`langchain` + `@langchain/anthropic`)
- Claude (`claude-sonnet-4-6`) via Anthropic
- MongoDB via Mongoose
- Validação com Zod

## Pré-requisitos

- Node.js 20+
- MongoDB rodando e acessível (local ou remoto)
- Uma chave de API da Anthropic

## Instalação

```bash
npm install
```

## Configuração

Copie o arquivo de exemplo e preencha as variáveis:

```bash
cp .env.example .env
```

```dotenv
ANTHROPIC_API_KEY=sua-chave-aqui
MONGODB_URI=mongodb://localhost:27017/compras-mercado
```

## Uso

```bash
npm run dev /caminho/absoluto/para/foto_cupom.jpg
```

Formatos de imagem suportados: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.

O comando lê a imagem, envia ao Claude, valida o JSON retornado, persiste a compra
e seus itens no MongoDB e imprime um resumo no console.

## Relatório mensal (API HTTP)

Suba o servidor e consulte o relatório consolidado de um mês:

```bash
npm run serve
curl http://localhost:3000/reports/2026-06
```

`GET /reports/:month` (mês no formato `YYYY-MM`) retorna em JSON:

- `totalSpent` — total gasto no mês;
- `purchaseCount` / `averageTicket` — nº de compras (cupons) e ticket médio;
- `itemCount` — total de itens comprados;
- `topStore` — estabelecimento com maior gasto;
- `storeRanking` — ranking de lojas (gasto, nº de visitas, ticket médio);
- `spendingByCategory` — gasto por categoria de produto (valor, % e nº de itens).

Mês fora do formato `YYYY-MM` retorna `400`. Mês sem compras retorna o relatório
com totais zerados.

## Build

```bash
npm run build   # compila TypeScript para dist/
```

## Estrutura

```
src/
├── index.ts            # entry point — orquestra o fluxo
├── extractReceipt.ts   # lê imagem, chama Claude via LangChain, valida o JSON
├── models/
│   ├── Purchase.ts     # model Mongoose (uma compra = um cupom)
│   └── Item.ts         # model Mongoose (cada produto)
├── db.ts               # conexão/desconexão do MongoDB
└── types.ts            # interfaces TypeScript + schema Zod do JSON extraído
```

## Modelo de dados

**Purchase** (uma compra): `storeName`, `storeCnpj?`, `purchaseDate`, `totalAmount`,
`imagePath`, `items[]` (refs para `Item`), `createdAt`, `updatedAt`.

**Item** (cada produto): `purchaseId` (ref para `Purchase`), `rawName`,
`normalizedName`, `category`, `unitPrice`, `quantity`, `unit`, `totalPrice`,
`createdAt`, `updatedAt`.

Categorias inferidas pela IA: `hortifruti`, `proteína`, `laticínios`, `padaria`,
`bebidas`, `limpeza`, `higiene`, `congelados`, `mercearia`, `outros`.
