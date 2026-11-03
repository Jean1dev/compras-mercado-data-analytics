import assert from "node:assert/strict";
import test from "node:test";
import {
  linkIncomingPurchase,
  resolvePurchases,
  type PurchaseIdentity,
  type ResolveResult,
} from "../src/storeIdentity.js";

const MONIARI_L1 = "MONIARI SUPERMERCADOS LTDA L1";
const MONIARI_LI = "MONIARI SUPERMERCADOS LTDA LI";
const WONIARI = "Woniari Supermercados Ltda L1";
const MONIARI_TITLE = "Moniari Supermercados LTDA L1";
const SAME_CNPJ = "11.222.333/0001-81";
const OTHER_CNPJ = "99888777000100";

function at(
  iso: string,
  id: string,
  storeName: string,
  storeCnpj: string | null = null,
): PurchaseIdentity {
  return { id, storeName, storeCnpj, purchaseDate: new Date(iso) };
}

function storeIdFor(result: ResolveResult, purchaseId: string): string {
  const found = result.assignments.find((assignment) => assignment.purchaseId === purchaseId);
  assert.ok(found);
  return found.storeId;
}

function assertOneStore(result: ResolveResult, purchaseIds: string[]): void {
  const ids = new Set(purchaseIds.map((purchaseId) => storeIdFor(result, purchaseId)));
  assert.equal(ids.size, 1);
}

test("junta caixa, sufixo e leitura errada da Moniari", () => {
  const result = resolvePurchases([
    at("2026-06-01T00:00:00Z", "a", MONIARI_L1),
    at("2026-06-02T00:00:00Z", "b", MONIARI_LI),
    at("2026-06-03T00:00:00Z", "c", WONIARI),
    at("2026-06-04T00:00:00Z", "d", MONIARI_TITLE),
  ]);
  assertOneStore(result, ["a", "b", "c", "d"]);
  assert.equal(result.stores.length, 1);
});

test("junta Atacadão com e sem acento", () => {
  const result = resolvePurchases([
    at("2026-06-01T00:00:00Z", "a", "Atacadão S.A."),
    at("2026-06-02T00:00:00Z", "b", "ATACADAO S/A"),
  ]);
  assertOneStore(result, ["a", "b"]);
});

test("separa filial e cidade", () => {
  const units = resolvePurchases([
    at("2026-06-01T00:00:00Z", "l1", MONIARI_L1),
    at("2026-06-02T00:00:00Z", "l2", "MONIARI SUPERMERCADOS LTDA L2"),
  ]);
  assert.notEqual(storeIdFor(units, "l1"), storeIdFor(units, "l2"));

  const cities = resolvePurchases([
    at("2026-06-01T00:00:00Z", "icara", "GIASSI SUPERMERCADOS IÇARA"),
    at("2026-06-02T00:00:00Z", "criciuma", "GIASSI SUPERMERCADOS CRICIUMA"),
  ]);
  assert.notEqual(storeIdFor(cities, "icara"), storeIdFor(cities, "criciuma"));
});

test("mantém redes diferentes em lojas próprias", () => {
  const result = resolvePurchases([
    at("2026-06-01T00:00:00Z", "moniari", MONIARI_L1),
    at("2026-06-02T00:00:00Z", "giassi", "GIASSI SUPERMERCADOS IÇARA"),
    at("2026-06-03T00:00:00Z", "atacadao", "Atacadão S.A."),
    at("2026-06-04T00:00:00Z", "rh", "Supermercado RH LTDA"),
  ]);
  const ids = ["moniari", "giassi", "atacadao", "rh"].map((id) => storeIdFor(result, id));
  assert.equal(new Set(ids).size, 4);
});

test("CNPJ válido manda no nome e CNPJ inválido cai no nome", () => {
  const merged = resolvePurchases([
    at("2026-06-01T00:00:00Z", "a", "Foo Mercadinho", SAME_CNPJ),
    at("2026-06-02T00:00:00Z", "b", "Bar Hortifruti", "11222333000181"),
  ]);
  assertOneStore(merged, ["a", "b"]);

  const split = resolvePurchases([
    at("2026-06-01T00:00:00Z", "a", MONIARI_L1, SAME_CNPJ),
    at("2026-06-02T00:00:00Z", "b", MONIARI_L1, OTHER_CNPJ),
  ]);
  assert.notEqual(storeIdFor(split, "a"), storeIdFor(split, "b"));

  const invalid = resolvePurchases([
    at("2026-06-01T00:00:00Z", "a", MONIARI_L1, "11222333000180"),
    at("2026-06-02T00:00:00Z", "b", MONIARI_LI, null),
    at("2026-06-03T00:00:00Z", "c", WONIARI, "00.000.000/0000-00"),
    at("2026-06-04T00:00:00Z", "d", MONIARI_TITLE, null),
  ]);
  assertOneStore(invalid, ["a", "b", "c", "d"]);
});

test("nome sem filial entra na única filial conhecida e fica de fora quando há duas", () => {
  const onlyIcara = resolvePurchases([
    at("2026-06-01T00:00:00Z", "icara", "GIASSI SUPERMERCADOS IÇARA"),
    at("2026-06-02T00:00:00Z", "bare", "GIASSI"),
  ]);
  assertOneStore(onlyIcara, ["icara", "bare"]);

  const bothCities = resolvePurchases([
    at("2026-06-01T00:00:00Z", "icara", "GIASSI SUPERMERCADOS IÇARA"),
    at("2026-06-02T00:00:00Z", "criciuma", "GIASSI SUPERMERCADOS CRICIUMA"),
    at("2026-06-03T00:00:00Z", "bare", "GIASSI"),
  ]);
  assert.notEqual(storeIdFor(bothCities, "bare"), storeIdFor(bothCities, "icara"));
  assert.notEqual(storeIdFor(bothCities, "bare"), storeIdFor(bothCities, "criciuma"));
});

test("grafias em meses diferentes continuam na mesma loja", () => {
  const result = resolvePurchases([
    at("2026-06-15T00:00:00Z", "june", WONIARI),
    at("2026-07-02T00:00:00Z", "july", MONIARI_L1),
  ]);
  assertOneStore(result, ["june", "july"]);
});

test("empate de grafia fica com a compra mais antiga", () => {
  const result = resolvePurchases([
    at("2026-06-02T00:00:00Z", "later", MONIARI_TITLE),
    at("2026-06-01T00:00:00Z", "earlier", WONIARI),
  ]);
  assert.equal(result.stores.length, 1);
  assert.equal(result.stores[0]?.label, WONIARI);
});

test("o rótulo segue a grafia mais frequente sem trocar o id", () => {
  const result = resolvePurchases([
    at("2026-06-01T00:00:00Z", "w", WONIARI),
    at("2026-06-02T00:00:00Z", "a", MONIARI_L1),
    at("2026-06-03T00:00:00Z", "b", MONIARI_L1),
    at("2026-06-04T00:00:00Z", "c", MONIARI_L1),
  ]);
  assert.equal(result.stores.length, 1);
  assert.equal(result.stores[0]?.label, MONIARI_L1);
  assert.equal(result.stores[0]?.id, storeIdFor(result, "w"));
  assert.equal(storeIdFor(result, "w"), storeIdFor(result, "c"));
});

test("a segunda resolução reaproveita a loja da grafia parecida", () => {
  const first = linkIncomingPurchase(
    [],
    [],
    at("2026-06-01T00:00:00Z", "p1", MONIARI_L1),
    () => "store-moniari",
  );
  const history: PurchaseIdentity[] = [
    { ...at("2026-06-01T00:00:00Z", "p1", MONIARI_L1), },
  ];
  const second = linkIncomingPurchase(
    history,
    first.stores,
    at("2026-06-02T00:00:00Z", "p2", WONIARI),
    () => "store-should-not-be-created",
  );
  assert.equal(second.storeId, first.storeId);
  assert.equal(second.storeName, WONIARI);
  assert.equal(second.stores.length, 1);
});
