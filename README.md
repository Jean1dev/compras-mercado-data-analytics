# compras-mercado-data-analytics

Leitor de cupom fiscal: recebe o caminho de uma imagem de cupom de supermercado, extrai os produtos via LLM multimodal (visão computacional, usando LangChain.js + LiteLLM), classifica cada item e persiste no MongoDB. O objetivo é acumular histórico de compras para analisar inflação pessoal, comparar preços entre estabelecimentos e identificar padrões de consumo.

## Stack

- Node.js + TypeScript (strict, ESM)
- [LangChain.js](https://js.langchain.com/) (`langchain` + `@langchain/openai`)
- Claude (`anthropic/claude-sonnet-4-6`) via [LiteLLM](https://docs.litellm.ai/) proxy
- MongoDB via Mongoose
- Validação com Zod

## Pré-requisitos

- Node.js 20+
- MongoDB rodando e acessível (local ou remoto)
- Acesso ao proxy LiteLLM (`LITELLM_BASE_URL` + `LITELLM_API_KEY`)

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
LITELLM_BASE_URL=https://lite-llm-deploy-production.up.railway.app/v1
LITELLM_API_KEY=sua-chave-aqui
LLM_MODEL=anthropic/claude-sonnet-4-6
MONGODB_URI=mongodb://localhost:27017/compras-mercado
```

> **BREAKING (v0.2+):** `ANTHROPIC_API_KEY` não é mais usada. Migre para `LITELLM_BASE_URL` e `LITELLM_API_KEY`.

## Uso

```bash
npm run dev /caminho/absoluto/para/foto_cupom.jpg
```

Formatos de imagem suportados: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.

O comando lê a imagem, envia ao LLM via LiteLLM, valida o JSON retornado, persiste a compra
e seus itens no MongoDB e imprime um resumo no console.

## Processamento de cupom via API HTTP (assíncrono + webhook)

Suba o servidor e envie as imagens do cupom na ordem em que devem ser analisadas:

```bash
npm run serve
curl -X POST http://localhost:3000/receipts \
  -H "Content-Type: application/json" \
  -d '{"imageUrls": ["https://exemplo.com/cupom-1.jpg", "https://exemplo.com/cupom-2.jpg"], "webhookUrl": "https://exemplo.com/callback"}'
```

`POST /receipts` responde imediatamente com `202 Accepted` e `{ "jobId": "...", "status": "accepted" }`,
sem esperar o processamento terminar. O download das imagens, a extração via LLM e a persistência
no MongoDB acontecem em background; à medida que os dados ficam disponíveis, o servidor faz chamadas
`POST` para o `webhookUrl` informado, uma por evento, sempre com `jobId`:

```jsonc
// nome do estabelecimento
{ "jobId": "...", "event": "storeName", "storeName": "Mercado Exemplo" }

// valor total da compra
{ "jobId": "...", "event": "totalAmount", "totalAmount": 123.45 }

// quantidade total de itens
{ "jobId": "...", "event": "itemCount", "itemCount": 10 }

// conclusão do job, com o resultado completo
{ "jobId": "...", "event": "completed", "purchaseId": "...", "itemCount": 10, "receipt": { /* ExtractedReceipt */ } }

// falha em qualquer etapa do processamento
{ "jobId": "...", "event": "failed", "error": "mensagem do erro" }
```

Em caso de sucesso, os eventos `storeName`, `totalAmount` e `itemCount` são enviados (nessa ordem),
seguidos do `completed`. Em caso de erro, apenas o `failed` é enviado. Campos obrigatórios do corpo
da requisição: `imageUrls` (array de 1 a 10 URLs) e `webhookUrl`. Todas as imagens são
tratadas como partes da mesma compra e geram um único `Purchase`. Por compatibilidade, `imageUrl`
continua aceito para uma única imagem; ele não pode ser enviado junto com `imageUrls`.
Requisição inválida retorna `400` de forma síncrona, antes de qualquer processamento.

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
├── extractReceipt.ts   # lê imagem, chama LLM via LiteLLM/LangChain, valida o JSON
├── llmEnv.ts           # validação das variáveis LiteLLM
├── models/
│   ├── Purchase.ts     # model Mongoose (uma compra = um cupom)
│   └── Item.ts         # model Mongoose (cada produto)
├── db.ts               # conexão/desconexão do MongoDB
└── types.ts            # interfaces TypeScript + schema Zod do JSON extraído
```

## Modelo de dados

**Purchase** (uma compra): `storeName`, `storeCnpj?`, `purchaseDate`, `totalAmount`,
`imagePaths[]`, `items[]` (refs para `Item`), `createdAt`, `updatedAt`. O campo legado
`imagePath` continua legível em documentos antigos.

**Item** (cada produto): `purchaseId` (ref para `Purchase`), `rawName`,
`normalizedName`, `category`, `unitPrice`, `quantity`, `unit`, `totalPrice`,
`createdAt`, `updatedAt`.

Categorias inferidas pela IA: `hortifruti`, `proteína`, `laticínios`, `padaria`,
`bebidas`, `limpeza`, `higiene`, `congelados`, `mercearia`, `outros`.
