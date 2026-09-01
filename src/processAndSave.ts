import { Purchase } from "./models/Purchase.js";
import { Item } from "./models/Item.js";
import { extractReceipt } from "./extractReceipt.js";
import type { ExtractedReceipt } from "./types.js";

export interface ProcessResult {
  purchaseId: string;
  receipt: ExtractedReceipt;
  itemCount: number;
}

export async function processAndSave(imagePaths: string[]): Promise<ProcessResult> {
  const receipt = await extractReceipt(imagePaths);

  const purchase = await Purchase.create({
    storeName: receipt.storeName,
    storeCnpj: receipt.storeCnpj ?? undefined,
    purchaseDate: receipt.purchaseDate ? new Date(receipt.purchaseDate) : new Date(),
    totalAmount: receipt.totalAmount,
    imagePaths,
    items: [],
  });

  const items = await Item.insertMany(
    receipt.items.map((item) => ({ ...item, purchaseId: purchase._id })),
  );

  purchase.items = items.map((item) => item._id);
  await purchase.save();

  return { purchaseId: String(purchase._id), receipt, itemCount: items.length };
}
