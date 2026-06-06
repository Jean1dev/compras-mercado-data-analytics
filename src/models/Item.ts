import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

/**
 * Item: cada produto dentro de uma compra (cupom fiscal).
 */
const itemSchema = new Schema(
  {
    purchaseId: { type: Schema.Types.ObjectId, ref: "Purchase", required: true },
    rawName: { type: String, required: true }, // nome exato como aparece no cupom
    normalizedName: { type: String, required: true }, // nome limpo/padronizado pela IA
    category: { type: String, required: true }, // categoria inferida pela IA
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true }, // "kg", "un", "l", etc.
    totalPrice: { type: Number, required: true },
  },
  { timestamps: true },
);

export type ItemDoc = InferSchemaType<typeof itemSchema>;

// Reaproveita o model se já compilado (evita OverwriteModelError em re-imports).
export const Item: Model<ItemDoc> =
  (models.Item as Model<ItemDoc>) ?? model<ItemDoc>("Item", itemSchema);
