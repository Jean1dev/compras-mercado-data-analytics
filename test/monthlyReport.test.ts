import assert from "node:assert/strict";
import test from "node:test";
import { rankStores } from "../src/monthlyReport.js";

const MONIARI_L1 = "MONIARI SUPERMERCADOS LTDA L1";

test("o mês da Moniari vira uma linha mesmo sem vínculo gravado", () => {
  const ranked = rankStores(
    [
      {
        id: "may",
        storeName: "Woniari Supermercados Ltda L1",
        storeCnpj: null,
        purchaseDate: new Date("2026-05-20T00:00:00Z"),
        totalAmount: 10,
      },
      {
        id: "a",
        storeName: MONIARI_L1,
        storeCnpj: null,
        purchaseDate: new Date("2026-06-01T00:00:00Z"),
        totalAmount: 66.47,
      },
      {
        id: "b",
        storeName: MONIARI_L1,
        storeCnpj: null,
        purchaseDate: new Date("2026-06-02T00:00:00Z"),
        totalAmount: 66.46,
      },
      {
        id: "c",
        storeName: MONIARI_L1,
        storeCnpj: null,
        purchaseDate: new Date("2026-06-03T00:00:00Z"),
        totalAmount: 66.46,
      },
      {
        id: "d",
        storeName: "MONIARI SUPERMERCADOS LTDA LI",
        storeCnpj: null,
        purchaseDate: new Date("2026-06-04T00:00:00Z"),
        totalAmount: 112.42,
      },
      {
        id: "e",
        storeName: "Woniari Supermercados Ltda L1",
        storeCnpj: null,
        purchaseDate: new Date("2026-06-05T00:00:00Z"),
        totalAmount: 33.95,
      },
      {
        id: "f",
        storeName: "Moniari Supermercados LTDA L1",
        storeCnpj: null,
        purchaseDate: new Date("2026-06-06T00:00:00Z"),
        totalAmount: 17.98,
      },
    ],
    "2026-06",
  );

  assert.equal(ranked.storeRanking.length, 1);
  assert.deepEqual(ranked.storeRanking[0], {
    storeName: MONIARI_L1,
    total: 363.74,
    purchaseCount: 6,
    averageTicket: 60.62,
  });
  assert.deepEqual(ranked.topStore, ranked.storeRanking[0]);
  assert.equal(ranked.totalSpent, 363.74);
  assert.equal(ranked.purchaseCount, 6);
  assert.equal(ranked.averageTicket, 60.62);
});
