# Especificação Técnica — Leitor de Cupom Fiscal

**Projeto:** compras-mercado-data-analytics
**Versão:** 0.1.0
**Status:** Scaffold funcional (extração + persistência end-to-end validadas)

---

## 1. Visão geral

Sistema de backend em TypeScript que recebe o **caminho de uma imagem** de cupom fiscal de supermercado, extrai os dados dos produtos via visão computacional (LLM multimodal — Claude), classifica cada item por categoria e persiste no MongoDB.

**Objetivo de longo prazo:** acumular histórico de compras para:
- analisar inflação pessoal ao longo do tempo;
- comparar preços do mesmo produto entre estabelecimentos;
- identificar padrões de consumo.

Esta versão entrega a **ingestão** (imagem → dados estruturados → banco). As análises são trabalho futuro sobre os dados acumulados.

---

## 2. Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js (TypeScript, ESM, strict) | 20+ |
| Orquestração de IA | LangChain.js (`langchain` + `@langchain/anthropic` + `@langchain/core`) | 0.3.x |
| LLM | Claude `claude-sonnet-4-6` (Anthropic) | — |
| Banco de dados | MongoDB via Mongoose | 8.x |
| Validação | Zod | 3.x |
| Config | dotenv | 16.x |
| Dev | tsx, typescript, @types/node | — |

---

## 3. Configuração

### Variáveis de ambiente (`.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sim | Chave da API da Anthropic. |
| `MONGODB_URI` | Sim | String de conexão do MongoDB (ex: `mongodb://localhost:27017/compras-mercado`). |

Ambas são validadas no início da execução; ausência interrompe o processo com mensagem clara e código de saída ≠ 0.

### Pré-requisitos

- MongoDB acessível na URI configurada.
- Chave de API válida.

---

## 4. Interface de uso (CLI)

```bash
npm run dev /caminho/absoluto/para/foto_cupom.jpg
```

- O caminho da imagem é lido de `process.argv[2]`.
- Formatos suportados: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.
- Saída: resumo formatado no console + documentos persistidos no MongoDB.

---

## 5. Arquitetura e fluxo

```
                    ┌──────────────┐
   imagem (path) ──▶│  index.ts    │  entry point / orquestração
                    └──────┬───────┘
                           │
        ┌──────────────────┼───────────────────┐
        ▼                  ▼                    ▼
  ┌──────────┐    ┌─────────────────┐    ┌──────────────┐
  │  db.ts   │    │ extractReceipt  │    │   models/    │
  │ connect/ │    │ imagem→base64   │    │ Purchase     │
  │ disconnect    │ →Claude→JSON    │    │ Item         │
  └──────────┘    │ →valida (Zod)   │    └──────────────┘
                  └─────────────────┘
```

### Sequência de execução (`index.ts`)

1. Lê e valida `process.argv[2]` (caminho da imagem) e `ANTHROPIC_API_KEY`.
2. `connectDB()` — conecta ao MongoDB.
3. `extractReceipt(path)` — extrai e valida os dados do cupom.
4. Cria o documento `Purchase` (sem itens ainda) para obter o `_id`.
5. `Item.insertMany(...)` — cria os itens vinculados via `purchaseId`.
6. Atualiza `Purchase.items` com os ObjectIds dos itens criados e salva.
7. Imprime o resumo no console.
8. `disconnectDB()` em bloco `finally` (garante desconexão mesmo em erro).

---

## 6. Módulo de extração (`extractReceipt.ts`)

### Entrada
Caminho de arquivo de imagem.

### Processo
1. **Detecção de media type** pela extensão (`detectMediaType`); extensão não suportada → erro.
2. **Leitura do arquivo** (`fs/promises.readFile`); falha de leitura → erro com o caminho.
3. **Conversão para base64**.
4. **Chamada ao Claude** via `ChatAnthropic`, com `HumanMessage` de conteúdo multimodal:
   - bloco `text`: prompt de extração;
   - bloco `image_url`: `data:<mediaType>;base64,<dados>`.
5. **Extração do texto** da resposta (`messageContentToText` — lida com string ou array de blocos).
6. **Parsing robusto de JSON** (`parseJsonFromResponse`):
   - remove cercas markdown (` ```json ... ``` `);
   - fallback: recorta do primeiro `{` ao último `}`;
   - falha total → erro incluindo a resposta crua.
7. **Validação Zod** (`extractedReceiptSchema.parse`) — tipa e garante o formato.

### Saída
Objeto `ExtractedReceipt` validado.

### Prompt de extração
Instrui o Claude a retornar **somente** JSON válido (sem markdown), com:
- separador decimal por ponto;
- categorias restritas à lista canônica;
- `null` para `storeCnpj`/`purchaseDate` quando ilegíveis.

### Parâmetros do modelo
- `model: "claude-sonnet-4-6"`
- `maxTokens: 4096`
- `invocationKwargs: { top_p: undefined, top_k: undefined }` — **workaround** (ver §10).

---

## 7. Modelo de dados (MongoDB / Mongoose)

Ambos os schemas usam `timestamps: true` → geram `createdAt` e `updatedAt`.

### `Purchase` (uma compra = um cupom)

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `storeName` | String | Sim | |
| `storeCnpj` | String | Não | |
| `purchaseDate` | Date | Sim | `new Date()` se não identificada |
| `totalAmount` | Number | Sim | |
| `imagePaths` | String[] | Sim | caminhos das imagens da compra; `imagePath` permanece apenas para documentos legados |
| `items` | [ObjectId → Item] | — | referências aos itens |
| `createdAt` / `updatedAt` | Date | auto | |

### `Item` (cada produto de uma compra)

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `purchaseId` | ObjectId → Purchase | Sim | |
| `rawName` | String | Sim | nome exato do cupom |
| `normalizedName` | String | Sim | nome limpo/padronizado pela IA |
| `category` | String | Sim | categoria inferida pela IA |
| `unitPrice` | Number | Sim | |
| `quantity` | Number | Sim | |
| `unit` | String | Sim | "kg", "un", "l", etc. |
| `totalPrice` | Number | Sim | |
| `createdAt` / `updatedAt` | Date | auto | |

**Relacionamento:** bidirecional — `Purchase.items[]` referencia `Item`, e `Item.purchaseId` referencia `Purchase`.

---

## 8. Schema de dados extraídos (Zod — `types.ts`)

### Categorias canônicas
`hortifruti`, `proteína`, `laticínios`, `padaria`, `bebidas`, `limpeza`, `higiene`, `congelados`, `mercearia`, `outros`.

### `ExtractedReceipt`
```
{
  storeName: string,
  storeCnpj: string | null,
  purchaseDate: string | null,   // ISO 8601
  totalAmount: number,
  items: ExtractedItem[]
}
```

### `ExtractedItem`
```
{
  rawName: string,
  normalizedName: string,
  category: Category,            // enum; valor inesperado cai em "outros" (.catch)
  unitPrice: number,
  quantity: number,
  unit: string,
  totalPrice: number
}
```

**Decisão de design:** `category` usa `z.enum(...).catch("outros")` para que uma categoria fora da lista não derrube a extração inteira — o item é classificado como `outros`.

---

## 9. Tratamento de erros

| Situação | Comportamento |
|---|---|
| Sem caminho de imagem | Mensagem de uso, exit 1 |
| `ANTHROPIC_API_KEY` ausente | Mensagem clara, exit 1 |
| `MONGODB_URI` ausente | Erro lançado por `connectDB`, exit 1 |
| Extensão de imagem não suportada | Erro com a extensão recebida |
| Falha ao ler o arquivo | Erro com o caminho (preserva `cause`) |
| Resposta do modelo sem JSON | Erro incluindo a resposta crua |
| JSON fora do formato esperado | `ZodError` com detalhes dos campos |
| Qualquer erro durante o fluxo | Capturado no `catch` final; desconexão garantida no `finally`; `exitCode = 1` |

---

## 10. Pendências e dívidas técnicas conhecidas

### Workaround do `top_p`/`top_k`
O `@langchain/anthropic@0.3.34` é anterior ao modelo `claude-sonnet-4-6` e injeta `top_p: -1` / `top_k: -1` como sentinelas para modelos desconhecidos. A API rejeita `top_p: -1`. Mitigado via `invocationKwargs: { top_p: undefined, top_k: undefined }` (espalhado por último na montagem do request, omitido do JSON). **Remover** ao atualizar `@langchain/anthropic` para uma versão que reconheça o modelo.

### Vulnerabilidades de dependências
`npm install` reporta vulnerabilidades transitivas (via `langchain`). Não tratadas para evitar `npm audit fix --force` (risco de breaking changes).

### Processamento assíncrono de cupom (`POST /receipts`)

O endpoint não processa a requisição de forma síncrona: ele valida a entrada,
dispara o processamento em background e responde imediatamente.

**Corpo da requisição:**
```json
{ "imageUrls": ["https://.../parte-1.jpg", "https://.../parte-2.jpg"], "webhookUrl": "https://..." }
```
`imageUrls` deve conter de 1 a 10 URLs válidas e `webhookUrl` deve ser uma URL
válida (`new URL(...)` sem lançar); falha de validação → `400` síncrono,
sem iniciar o job. O campo legado `imageUrl` pode substituir `imageUrls` para
uma única imagem, mas os dois não podem ser enviados juntos.

**Resposta imediata:** `202 Accepted` com `{ "jobId": "<uuid>", "status": "accepted" }`
(`jobId` gerado via `crypto.randomUUID()`).

**Job em background** (`processReceiptJob`, em `server.ts`):
1. Baixa de 1 a 10 imagens de `imageUrls`, na ordem recebida, para arquivos temporários nomeados com o `jobId`. O campo legado `imageUrl` continua aceito para uma imagem; enviar os dois campos retorna `400`.
2. Envia todas as imagens juntas ao modelo, que as trata como partes da mesma compra, combina informações complementares e evita duplicar trechos sobrepostos.
3. `processAndSave(tempPaths)` — persiste uma única compra com todos os itens extraídos.
4. Remove todos os arquivos temporários (`finally`, best-effort).
5. Notifica o `webhookUrl` via `sendWebhook` (`src/webhook.ts`), com uma chamada
   `POST` JSON por evento — cada payload traz `jobId` e um discriminante `event`:
   - sucesso, nessa ordem:
     1. `{ jobId, event: "storeName", storeName }`
     2. `{ jobId, event: "totalAmount", totalAmount }`
     3. `{ jobId, event: "itemCount", itemCount }`
     4. `{ jobId, event: "completed", purchaseId, itemCount, receipt }`
   - falha (download, extração ou persistência): apenas
     `{ jobId, event: "failed", error }`

Os três primeiros eventos de sucesso derivam do mesmo `ExtractedReceipt` já
obtido — não há extração incremental de campo a campo; eles existem para dar
ao consumidor do webhook acesso rápido a `storeName`/`totalAmount`/`itemCount`
sem precisar esperar ou parsear o payload `completed` inteiro.

Erros no job (download, extração, persistência) são capturados, reportados ao
Sentry e convertidos no webhook `failed` — nunca viram uma exceção não
tratada no processo. Falha ao **entregar** qualquer um dos webhooks (rede,
endpoint fora do ar, resposta não-2xx) é logada e reportada ao Sentry
individualmente, mas não é reenviada nem interrompe o envio dos eventos
seguintes (sem retry nesta versão).

### Relatório mensal (`src/monthlyReport.ts` + `GET /reports/:month`)

Endpoint HTTP que consolida as compras de um mês (`YYYY-MM`) via *aggregation
pipelines* do Mongoose:

- **Nível de compra** (`Purchase`): total gasto, nº de cupons, ticket médio e
  ranking de estabelecimentos (gasto, visitas, ticket médio por loja).
- **Nível de item** (`Purchase` → `$lookup` em `items`): gasto por categoria de
  produto, com valor, percentual (sobre a soma dos itens) e contagem.

Filtro por `purchaseDate ∈ [início do mês, início do mês seguinte)` (intervalo
calculado em UTC por `getMonthRange`). Mês inválido → `InvalidMonthError` →
HTTP 400. Mês sem compras → totais zerados e `topStore: null` (não quebra).

Campos do `MonthlyReport`: `month`, `range`, `totalSpent`, `purchaseCount`,
`averageTicket`, `itemCount`, `topStore`, `storeRanking`, `spendingByCategory`.

### Não implementado nesta versão
- Camada de análise avançada: comparação mês a mês (inflação pessoal), top
  produtos, comparação de preços entre estabelecimentos, padrões de consumo.
- Deduplicação de compras (reprocessar a mesma imagem cria duplicatas).
- Testes automatizados.
- Normalização de nomes de produto entre estabelecimentos (necessária para comparação de preços).
- Persistência do status do job (`jobId` não é gravado em lugar algum; se o
  processo reiniciar no meio de um job, o resultado se perde).
- Retry/backoff na entrega do webhook.

---

## 11. Verificação

| # | Verificação | Status |
|---|---|---|
| 1 | `npm install` | ✅ |
| 2 | `npx tsc --noEmit` (strict) | ✅ exit 0 |
| 3 | CLI sem args → mensagem de uso | ✅ exit 1 |
| 4 | `ANTHROPIC_API_KEY` ausente → erro | ✅ exit 1 |
| 5 | Extração + persistência end-to-end (cupom real) | ✅ 10 itens persistidos |

---

## 12. Estrutura de arquivos

```
/
├── src/
│   ├── index.ts            # entry point — orquestra o fluxo
│   ├── server.ts           # servidor Fastify — POST /receipts (assíncrono), GET /reports/:month
│   ├── webhook.ts          # envio do POST de callback (sendWebhook)
│   ├── extractReceipt.ts   # lê imagem, chama Claude via LangChain, valida o JSON
│   ├── processAndSave.ts   # extrai + persiste (Purchase + Item)
│   ├── monthlyReport.ts    # agregação do relatório mensal
│   ├── models/
│   │   ├── Purchase.ts     # model Mongoose (compra)
│   │   └── Item.ts         # model Mongoose (produto)
│   ├── db.ts               # conexão/desconexão do MongoDB
│   └── types.ts            # interfaces TS + schema Zod
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
└── SPECS.md                # este documento
```
