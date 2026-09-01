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
    // Legado: documentos antigos podem conter somente este campo.
    imagePath: { type: String },
    imagePaths: {
      type: [String],
      validate: {
        validator: function (this: { imagePath?: string }, paths: string[]) {
          return paths.length > 0 || Boolean(this.imagePath);
        },
        message: "A compra deve conter imagePaths ou o imagePath legado",
      },
    },
    items: [{ type: Schema.Types.ObjectId, ref: "Item" }],
  },
  { timestamps: true },
);

export type PurchaseDoc = InferSchemaType<typeof purchaseSchema>;

// Reaproveita o model se já compilado (evita OverwriteModelError em re-imports).
export const Purchase: Model<PurchaseDoc> =
  (models.Purchase as Model<PurchaseDoc>) ??
  model<PurchaseDoc>("Purchase", purchaseSchema);
