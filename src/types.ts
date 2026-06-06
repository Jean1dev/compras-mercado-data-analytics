import { z } from "zod";

/**
 * Categorias sugeridas para o Claude classificar cada item.
 * Mantidas como tupla `const` para servir tanto ao enum do Zod quanto ao tipo TS.
 */
export const CATEGORIES = [
  "hortifruti",
  "proteína",
  "laticínios",
  "padaria",
  "bebidas",
  "limpeza",
  "higiene",
  "congelados",
  "mercearia",
  "outros",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Schema Zod de um item extraído do cupom.
 * `category` aceita um valor fora da lista (cai em "outros") via `.catch`,
 * para não derrubar a extração inteira por uma categoria inesperada.
 */
export const extractedItemSchema = z.object({
  rawName: z.string(),
  normalizedName: z.string(),
  category: z.enum(CATEGORIES).catch("outros"),
  unitPrice: z.number(),
  quantity: z.number(),
  unit: z.string(),
  totalPrice: z.number(),
});

/**
 * Schema Zod do cupom completo retornado pelo Claude.
 * `storeCnpj` e `purchaseDate` podem vir nulos (o modelo pode não conseguir lê-los).
 */
export const extractedReceiptSchema = z.object({
  storeName: z.string(),
  storeCnpj: z.string().nullable(),
  purchaseDate: z.string().nullable(),
  totalAmount: z.number(),
  items: z.array(extractedItemSchema),
});

export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;
