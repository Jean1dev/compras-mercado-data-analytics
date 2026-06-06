import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { extractedReceiptSchema, type ExtractedReceipt } from "./types.js";

const MODEL = "claude-sonnet-4-6";

/** Prompt de extração: instrui o Claude a devolver SOMENTE um JSON válido. */
const EXTRACTION_PROMPT = `Você é um extrator de dados de cupons fiscais de supermercado brasileiros.
Analise a imagem do cupom e retorne SOMENTE um JSON válido (sem markdown, sem texto antes ou depois) neste formato exato:

{
  "storeName": "Nome do estabelecimento",
  "storeCnpj": "00.000.000/0000-00 ou null",
  "purchaseDate": "ISO 8601 (ex: 2024-05-12T18:30:00) ou null",
  "totalAmount": 0.00,
  "items": [
    {
      "rawName": "Nome exato como aparece no cupom",
      "normalizedName": "Nome limpo e padronizado",
      "category": "categoria",
      "unitPrice": 0.00,
      "quantity": 1,
      "unit": "un",
      "totalPrice": 0.00
    }
  ]
}

Use SOMENTE uma destas categorias: "hortifruti", "proteína", "laticínios", "padaria", "bebidas", "limpeza", "higiene", "congelados", "mercearia", "outros".
Use ponto como separador decimal. Se um campo não for legível, use null (para storeCnpj/purchaseDate) ou seu melhor palpite numérico.`;

/** Mapeia a extensão do arquivo para o media type da imagem. */
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

/**
 * Extrai o texto bruto do conteúdo retornado pelo modelo, que pode vir como
 * string ou como array de blocos de conteúdo.
 */
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

/**
 * Tenta isolar e parsear o JSON da resposta do modelo, mesmo que venha com
 * cercas markdown ou texto ao redor.
 */
function parseJsonFromResponse(raw: string): unknown {
  // Remove cercas markdown ```json ... ``` se presentes.
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(text);
  } catch {
    // Fallback: recorta do primeiro "{" ao último "}".
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error(
      `Não foi possível extrair JSON da resposta do modelo. Resposta recebida:\n${raw}`,
    );
  }
}

/**
 * Lê uma imagem de cupom fiscal, envia ao Claude via LangChain e retorna os
 * dados estruturados e validados.
 */
export async function extractReceipt(imagePath: string): Promise<ExtractedReceipt> {
  const mediaType = detectMediaType(imagePath);

  let buffer: Buffer;
  try {
    buffer = await readFile(imagePath);
  } catch (err) {
    throw new Error(
      `Não foi possível ler a imagem em "${imagePath}". Verifique se o caminho está correto.`,
      { cause: err },
    );
  }
  const base64 = buffer.toString("base64");

  // Esta versão do @langchain/anthropic envia top_p/top_k = -1 por padrão para
  // modelos que não conhece (como o sonnet-4-6), e a API rejeita top_p = -1.
  // invocationKwargs é espalhado por último na montagem do request, então
  // sobrescreve esses defaults; definidos como undefined, são omitidos do JSON.
  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 4096,
    invocationKwargs: { top_p: undefined, top_k: undefined },
  });

  const message = new HumanMessage({
    content: [
      { type: "text", text: EXTRACTION_PROMPT },
      {
        type: "image_url",
        image_url: { url: `data:${mediaType};base64,${base64}` },
      },
    ],
  });

  const response = await model.invoke([message]);
  const rawText = messageContentToText(response.content);
  const parsed = parseJsonFromResponse(rawText);

  // Valida e tipa o JSON; lança ZodError com detalhes se o formato divergir.
  return extractedReceiptSchema.parse(parsed);
}
