import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { jsonrepair } from "jsonrepair";
import { extractedReceiptSchema, type ExtractedReceipt } from "./types.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";
const MAX_TOKENS = 8192;
const MAX_ATTEMPTS = 3;

const EXTRACTION_PROMPT = `Você é um extrator de dados de cupons fiscais de supermercado brasileiros.
As imagens fornecidas pertencem à mesma compra e estão na ordem enviada pelo cliente. Elas podem ser páginas, trechos ou ângulos sobrepostos do mesmo cupom.
Analise todas as imagens em conjunto e preencha a ferramenta de extração com TODOS os itens legíveis, retornando um único cupom.

Regras:
- Combine informações complementares entre as imagens e não duplique itens que apareçam em imagens sobrepostas.
- Use SOMENTE uma destas categorias: "hortifruti", "proteína", "laticínios", "padaria", "bebidas", "limpeza", "higiene", "congelados", "mercearia", "outros".
- Use ponto como separador decimal.
- Se storeCnpj ou purchaseDate não forem legíveis, use null.
- Para valores numéricos ilegíveis, use seu melhor palpite.
- rawName deve ser o nome exato como aparece no cupom; normalizedName deve ser limpo e padronizado.`;

const FALLBACK_PROMPT = `${EXTRACTION_PROMPT}

Retorne SOMENTE um JSON válido (sem markdown, sem texto antes ou depois) neste formato:
{
  "storeName": "string",
  "storeCnpj": "string ou null",
  "purchaseDate": "ISO 8601 ou null",
  "totalAmount": 0.00,
  "items": [
    {
      "rawName": "string",
      "normalizedName": "string",
      "category": "categoria",
      "unitPrice": 0.00,
      "quantity": 1,
      "unit": "un",
      "totalPrice": 0.00
    }
  ]
}`;

function detectMediaType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      throw new Error(
        `Extensão de imagem não suportada: "${ext}". Use .jpg, .jpeg, .png, .webp ou .gif.`,
      );
  }
}

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === "string"
          ? block
          : block && typeof block === "object" && "text" in block
            ? String((block as { text: unknown }).text)
            : "",
      )
      .join("");
  }
  return String(content ?? "");
}

function parseJsonFromResponse(raw: string): unknown {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
    return JSON.parse(jsonrepair(text));
  }
}

function createModel(): ChatOpenAI {
  return new ChatOpenAI({
    model: process.env.LLM_MODEL ?? DEFAULT_MODEL,
    apiKey: process.env.LITELLM_API_KEY,
    maxTokens: MAX_TOKENS,
    configuration: { baseURL: process.env.LITELLM_BASE_URL },
  });
}

interface EncodedImage {
  mediaType: string;
  base64: string;
}

function buildImageMessage(prompt: string, images: EncodedImage[]): HumanMessage {
  return new HumanMessage({
    content: [
      ...images.map(({ mediaType, base64 }) => ({
        type: "image_url",
        image_url: { url: `data:${mediaType};base64,${base64}` },
      })),
      { type: "text", text: prompt },
    ],
  });
}

function isRetryableExtractionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === "SyntaxError" ||
    err.name === "ZodError" ||
    err.name === "OutputParserException" ||
    msg.includes("json") ||
    msg.includes("failed to parse") ||
    msg.includes("tool") ||
    msg.includes("expected")
  );
}

async function extractWithStructuredOutput(
  images: EncodedImage[],
): Promise<ExtractedReceipt> {
  const model = createModel();
  const structured = model.withStructuredOutput(extractedReceiptSchema, {
    name: "extract_receipt",
  });
  const message = buildImageMessage(EXTRACTION_PROMPT, images);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await structured.invoke([message]);
      return extractedReceiptSchema.parse(result);
    } catch (err) {
      lastError = err;
      if (attempt === MAX_ATTEMPTS || !isRetryableExtractionError(err)) {
        throw err;
      }
      console.warn(
        `⚠ Extração estruturada falhou (tentativa ${attempt}/${MAX_ATTEMPTS}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  throw lastError;
}

async function extractWithTextFallback(
  images: EncodedImage[],
): Promise<ExtractedReceipt> {
  const model = createModel();
  const message = buildImageMessage(FALLBACK_PROMPT, images);
  const response = await model.invoke([message]);
  const rawText = messageContentToText(response.content);
  const parsed = parseJsonFromResponse(rawText);
  return extractedReceiptSchema.parse(parsed);
}

export async function extractReceipt(imagePaths: string[]): Promise<ExtractedReceipt> {
  if (imagePaths.length === 0) {
    throw new Error("Informe ao menos uma imagem para extração.");
  }

  const images = await Promise.all(
    imagePaths.map(async (imagePath): Promise<EncodedImage> => {
      const mediaType = detectMediaType(imagePath);
      try {
        const buffer = await readFile(imagePath);
        return { mediaType, base64: buffer.toString("base64") };
      } catch (err) {
        throw new Error(
          `Não foi possível ler a imagem em "${imagePath}". Verifique se o caminho está correto.`,
          { cause: err },
        );
      }
    }),
  );

  try {
    return await extractWithStructuredOutput(images);
  } catch (structuredErr) {
    console.warn(
      `⚠ Structured output esgotou retries; tentando fallback textual: ${
        structuredErr instanceof Error ? structuredErr.message : String(structuredErr)
      }`,
    );
    try {
      return await extractWithTextFallback(images);
    } catch (fallbackErr) {
      throw new Error(
        `Falha ao extrair cupom após structured output e fallback textual. ` +
          `Último erro: ${
            fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
          }`,
        { cause: fallbackErr },
      );
    }
  }
}
