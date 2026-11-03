import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { Purchase } from "../src/models/Purchase.js";
import { Store } from "../src/models/Store.js";

const requiredFields = {
  storeName: "Mercado Exemplo",
  purchaseDate: new Date("2026-08-31T12:00:00Z"),
  totalAmount: 10,
};

test("aceita uma nova compra com imagePaths", () => {
  const purchase = new Purchase({ ...requiredFields, imagePaths: ["one.jpg", "two.jpg"] });
  assert.equal(purchase.validateSync(), undefined);
});

test("mantém documentos legados com imagePath válidos", () => {
  const purchase = new Purchase({ ...requiredFields, imagePath: "legacy.jpg" });
  assert.equal(purchase.validateSync(), undefined);
});

test("guarda o nome cru e aceita referência de loja", () => {
  const store = new Store({
    label: "MONIARI SUPERMERCADOS LTDA L1",
    brand: "moniari",
    branch: "l1",
  });
  assert.equal(store.validateSync(), undefined);

  const purchase = new Purchase({
    ...requiredFields,
    imagePaths: ["cupom.jpg"],
    storeName: "Woniari Supermercados Ltda L1",
    storeId: new mongoose.Types.ObjectId(),
  });
  assert.equal(purchase.validateSync(), undefined);
  assert.equal(purchase.storeName, "Woniari Supermercados Ltda L1");
  assert.ok(purchase.storeId);
});

test("rejeita uma compra sem qualquer imagem", () => {
  const purchase = new Purchase(requiredFields);
  assert.ok(purchase.validateSync());
});
