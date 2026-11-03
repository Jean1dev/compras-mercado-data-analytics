import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const storeSchema = new Schema(
  {
    label: { type: String, required: true },
    brand: { type: String, default: "" },
    branch: { type: String, default: "" },
    cnpj: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

export type StoreDoc = InferSchemaType<typeof storeSchema>;

export const Store: Model<StoreDoc> =
  (models.Store as Model<StoreDoc>) ?? model<StoreDoc>("Store", storeSchema);
