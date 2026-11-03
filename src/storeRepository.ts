import mongoose from "mongoose";
import { Purchase } from "./models/Purchase.js";
import { Store } from "./models/Store.js";
import {
  resolvePurchases,
  type PurchaseIdentity,
  type ResolveResult,
  type StoreRecord,
} from "./storeIdentity.js";

export interface StoredPurchase extends PurchaseIdentity {
  totalAmount: number;
}

export function createStoreId(): string {
  return new mongoose.Types.ObjectId().toString();
}

export async function loadPurchases(): Promise<StoredPurchase[]> {
  const docs = await Purchase.find()
    .select("storeName storeCnpj purchaseDate totalAmount")
    .lean();
  return docs.map((doc) => ({
    id: String(doc._id),
    storeName: doc.storeName,
    storeCnpj: doc.storeCnpj ?? null,
    purchaseDate: new Date(doc.purchaseDate),
    totalAmount: doc.totalAmount,
  }));
}

export async function loadStores(): Promise<StoreRecord[]> {
  const docs = await Store.find().sort({ _id: 1 }).lean();
  return docs.map((doc) => ({
    id: String(doc._id),
    label: doc.label,
    brand: doc.brand ?? "",
    branch: doc.branch ?? "",
    ...(doc.cnpj ? { cnpj: doc.cnpj } : {}),
  }));
}

export async function saveStores(stores: StoreRecord[]): Promise<void> {
  for (const store of stores) {
    const $set: { label: string; brand: string; branch: string; cnpj?: string } = {
      label: store.label,
      brand: store.brand,
      branch: store.branch,
    };
    if (store.cnpj) $set.cnpj = store.cnpj;
    await Store.updateOne(
      { _id: store.id },
      { $set, $setOnInsert: { _id: store.id } },
      { upsert: true },
    );
  }
}

export async function applyAssignments(result: ResolveResult): Promise<void> {
  if (result.assignments.length === 0) return;
  await Purchase.bulkWrite(
    result.assignments.map((assignment) => ({
      updateOne: {
        filter: { _id: assignment.purchaseId },
        update: { $set: { storeId: new mongoose.Types.ObjectId(assignment.storeId) } },
      },
    })),
  );
}

export async function deleteUnreferencedStores(keepIds: string[]): Promise<void> {
  await Store.deleteMany({ _id: { $nin: keepIds } });
}

export async function reconcileSavedPurchases(): Promise<{
  purchases: StoredPurchase[];
  result: ResolveResult;
}> {
  const [purchases, stores] = await Promise.all([loadPurchases(), loadStores()]);
  const result = resolvePurchases(purchases, stores, createStoreId);
  await saveStores(result.stores);
  await applyAssignments(result);
  await deleteUnreferencedStores(result.stores.map((store) => store.id));
  return { purchases, result };
}
