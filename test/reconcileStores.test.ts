import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatReconciliationReport,
  resolvePurchases,
  type PurchaseIdentity,
} from "../src/storeIdentity.js";

test("a segunda passagem mantém vínculos e lojas", () => {
  const purchases: PurchaseIdentity[] = [
    {
      id: "1",
      storeName: "MONIARI SUPERMERCADOS LTDA L1",
      storeCnpj: null,
      purchaseDate: new Date("2026-06-01T00:00:00Z"),
    },
    {
      id: "2",
      storeName: "Woniari Supermercados Ltda L1",
      storeCnpj: null,
      purchaseDate: new Date("2026-06-02T00:00:00Z"),
    },
    {
      id: "3",
      storeName: "GIASSI SUPERMERCADOS IÇARA",
      storeCnpj: null,
      purchaseDate: new Date("2026-06-03T00:00:00Z"),
    },
  ];

  const first = resolvePurchases(purchases);
  const second = resolvePurchases(purchases, first.stores);
  assert.deepEqual(second.assignments, first.assignments);
  assert.deepEqual(second.stores, first.stores);

  const report = formatReconciliationReport(purchases, second);
  assert.match(report, /Compras lidas: 3/);
  assert.match(report, /Lojas mantidas: 2/);
  assert.match(report, /Woniari Supermercados Ltda L1/);
  assert.match(report, /GIASSI SUPERMERCADOS IÇARA/);
});

test("o servidor HTTP não ganha rota de religação", async () => {
  const source = await readFile(fileURLToPath(new URL("../src/server.ts", import.meta.url)), "utf8");
  const posts = [...source.matchAll(/app\.post\(\s*"([^"]+)"/g)].map((match) => match[1]);
  const gets = [...source.matchAll(/app\.get\(\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(posts, ["/receipts"]);
  assert.deepEqual(gets, ["/reports/:month"]);
});
