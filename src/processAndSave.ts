import mongoose from "mongoose";
import { Purchase } from "./models/Purchase.js";
import { Item } from "./models/Item.js";
import { extractReceipt } from "./extractReceipt.js";
import { linkIncomingPurchase, type PurchaseIdentity } from "./storeIdentity.js";
import { createStoreId, loadPurchases, loadStores, saveStores } from "./storeRepository.js";
import type { ExtractedReceipt } from "./types.js";

export interface ProcessResult {
  purchaseId: string;
  receipt: ExtractedReceipt;
  itemCount: number;
}

export async function processAndSave(imagePaths: string[]): Promise<ProcessResult> {
  const receipt = await extractReceipt(imagePaths);
  const purchaseDate = receipt.purchaseDate ? new Date(receipt.purchaseDate) : new Date();
  const [history, stores] = await Promise.all([loadPurchases(), loadStores()]);
  const incoming: PurchaseIdentity = {
    id: new mongoose.Types.ObjectId().toString(),
    storeName: receipt.storeName,
    storeCnpj: receipt.storeCnpj,
    purchaseDate,
  };
  const link = linkIncomingPurchase(history, stores, incoming, createStoreId);
  await saveStores(link.stores);

  const purchase = await Purchase.create({
    _id: incoming.id,
    storeName: receipt.storeName,
    storeCnpj: receipt.storeCnpj ?? undefined,
    storeId: link.storeId,
    purchaseDate,
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
