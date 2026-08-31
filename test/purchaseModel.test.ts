import assert from "node:assert/strict";
import test from "node:test";
import { Purchase } from "../src/models/Purchase.js";

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

test("rejeita uma compra sem qualquer imagem", () => {
  const purchase = new Purchase(requiredFields);
  assert.ok(purchase.validateSync());
});
