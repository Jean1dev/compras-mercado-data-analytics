import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

/**
 * Purchase: uma compra = um cupom fiscal.
 */
const purchaseSchema = new Schema(
  {
    storeName: { type: String, required: true },
    storeCnpj: { type: String }, // opcional
    purchaseDate: { type: Date, required: true },
    totalAmount: { type: Number, required: true },
    imagePath: { type: String, required: true },
    items: [{ type: Schema.Types.ObjectId, ref: "Item" }],
  },
  { timestamps: true },
);

export type PurchaseDoc = InferSchemaType<typeof purchaseSchema>;

// Reaproveita o model se já compilado (evita OverwriteModelError em re-imports).
export const Purchase: Model<PurchaseDoc> =
  (models.Purchase as Model<PurchaseDoc>) ??
  model<PurchaseDoc>("Purchase", purchaseSchema);
