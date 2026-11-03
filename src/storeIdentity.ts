const TRADE_NAME_THRESHOLD = 0.88;

const DROPPED_TOKENS = new Set([
  "ltda",
  "sa",
  "me",
  "epp",
  "eireli",
  "supermercado",
  "supermercados",
  "mercado",
]);

const FIRST_CNPJ_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export interface PurchaseIdentity {
  id: string;
  storeName: string;
  storeCnpj?: string | null;
  purchaseDate: Date;
}

export interface StoreRecord {
  id: string;
  label: string;
  brand: string;
  branch: string;
  cnpj?: string;
}

export interface StoreAssignment {
  purchaseId: string;
  storeId: string;
}

export interface ResolveResult {
  stores: StoreRecord[];
  assignments: StoreAssignment[];
}

export interface IncomingLink {
  storeId: string;
  storeName: string;
  stores: StoreRecord[];
}

interface ParsedName {
  brand: string;
  branch: string;
}

function comparePurchases(left: PurchaseIdentity, right: PurchaseIdentity): number {
  const byDate = left.purchaseDate.getTime() - right.purchaseDate.getTime();
  if (byDate !== 0) return byDate;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function jaro(left: string, right: string): number {
  if (left === right) return 1;
  const leftLength = left.length;
  const rightLength = right.length;
  if (leftLength === 0 || rightLength === 0) return 0;

  const matchDistance = Math.max(Math.floor(Math.max(leftLength, rightLength) / 2) - 1, 0);
  const leftMatches = Array<boolean>(leftLength).fill(false);
  const rightMatches = Array<boolean>(rightLength).fill(false);
  let matches = 0;

  for (let i = 0; i < leftLength; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, rightLength);
    for (let j = start; j < end; j += 1) {
      if (rightMatches[j] || left[i] !== right[j]) continue;
      leftMatches[i] = true;
      rightMatches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < leftLength; i += 1) {
    if (!leftMatches[i]) continue;
    while (!rightMatches[k]) k += 1;
    if (left[i] !== right[k]) transpositions += 1;
    k += 1;
  }
  transpositions /= 2;

  return (
    (matches / leftLength + matches / rightLength + (matches - transpositions) / matches) / 3
  );
}

function jaroWinkler(left: string, right: string): number {
  const similarity = jaro(left, right);
  const limit = Math.min(4, left.length, right.length);
  let prefix = 0;
  while (prefix < limit && left[prefix] === right[prefix]) prefix += 1;
  return similarity + prefix * 0.1 * (1 - similarity);
}

function contentTokens(name: string): string[] {
  const folded = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = folded.length === 0 ? [] : folded.split(/\s+/);
  const kept = tokens.filter((token) => !DROPPED_TOKENS.has(token));
  if (kept.length >= 2 && kept.at(-2) === "s" && kept.at(-1) === "a") {
    return kept.slice(0, -2);
  }
  return kept;
}

function branchCode(token: string): string | null {
  if (!/^l[0-9il]{1,2}$/.test(token)) return null;
  return token === "li" ? "l1" : token;
}

function parseStoreName(name: string): ParsedName {
  const tokens = contentTokens(name);
  if (tokens.length === 0) return { brand: "", branch: "" };
  const code = branchCode(tokens[tokens.length - 1] ?? "");
  if (code !== null) {
    return { brand: tokens.slice(0, -1).join(" "), branch: code };
  }
  if (tokens.length === 1) return { brand: tokens[0] ?? "", branch: "" };
  return {
    brand: tokens.slice(0, -1).join(" "),
    branch: tokens[tokens.length - 1] ?? "",
  };
}

function cnpjCheckDigit(digits: number[], weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + weight * (digits[index] ?? 0), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function usableCnpj(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return null;
  const numbers = [...digits].map(Number);
  if (cnpjCheckDigit(numbers, FIRST_CNPJ_WEIGHTS) !== numbers[12]) return null;
  if (cnpjCheckDigit(numbers, SECOND_CNPJ_WEIGHTS) !== numbers[13]) return null;
  return digits;
}

function matchByName(stores: StoreRecord[], brand: string, branch: string): StoreRecord | null {
  let best: StoreRecord | null = null;
  let bestScore = -1;
  for (const store of stores) {
    if (store.branch !== branch) continue;
    const score = jaroWinkler(store.brand, brand);
    if (score < TRADE_NAME_THRESHOLD || score < bestScore) continue;
    if (score === bestScore && best && stores.indexOf(store) > stores.indexOf(best)) continue;
    best = store;
    bestScore = score;
  }
  if (best) return best;
  if (branch !== "") return null;
  const brandMatches = stores.filter(
    (store) => jaroWinkler(store.brand, brand) >= TRADE_NAME_THRESHOLD,
  );
  return brandMatches.length === 1 ? (brandMatches[0] ?? null) : null;
}

function findStore(
  stores: StoreRecord[],
  parsed: ParsedName,
  cnpj: string | null,
): StoreRecord | null {
  if (cnpj) {
    const byCnpj = stores.find((store) => store.cnpj === cnpj);
    if (byCnpj) return byCnpj;
  }
  const byName = matchByName(stores, parsed.brand, parsed.branch);
  if (!byName) return null;
  if (cnpj && byName.cnpj && byName.cnpj !== cnpj) return null;
  return byName;
}

function chooseLabel(purchases: PurchaseIdentity[]): string {
  const grouped = new Map<string, { count: number; earliest: PurchaseIdentity }>();
  for (const purchase of purchases) {
    const current = grouped.get(purchase.storeName);
    if (!current) {
      grouped.set(purchase.storeName, { count: 1, earliest: purchase });
      continue;
    }
    current.count += 1;
    if (comparePurchases(purchase, current.earliest) < 0) current.earliest = purchase;
  }

  let bestName = purchases[0]?.storeName ?? "";
  let best = grouped.get(bestName);
  for (const [name, info] of grouped) {
    if (
      !best ||
      info.count > best.count ||
      (info.count === best.count && comparePurchases(info.earliest, best.earliest) < 0)
    ) {
      bestName = name;
      best = info;
    }
  }
  return bestName;
}

function refreshLabels(
  stores: StoreRecord[],
  ordered: PurchaseIdentity[],
  assignments: StoreAssignment[],
): void {
  const members = new Map<string, PurchaseIdentity[]>();
  ordered.forEach((purchase, index) => {
    const storeId = assignments[index]?.storeId;
    if (!storeId) return;
    const list = members.get(storeId) ?? [];
    list.push(purchase);
    members.set(storeId, list);
  });

  for (const store of stores) {
    const list = members.get(store.id);
    if (!list || list.length === 0) continue;
    const label = chooseLabel(list);
    const parsed = parseStoreName(label);
    store.label = label;
    if (parsed.brand) store.brand = parsed.brand;
    if (parsed.branch) store.branch = parsed.branch;
  }
}

export function resolvePurchases(
  purchases: PurchaseIdentity[],
  existingStores: StoreRecord[] = [],
  createId?: () => string,
): ResolveResult {
  let sequence = 0;
  const nextId =
    createId ??
    (() => {
      sequence += 1;
      return `store_${sequence}`;
    });
  const stores = existingStores.map((store) => ({ ...store }));
  const ordered = [...purchases].sort(comparePurchases);
  const assignments: StoreAssignment[] = [];

  for (const purchase of ordered) {
    const parsed = parseStoreName(purchase.storeName);
    const cnpj = usableCnpj(purchase.storeCnpj);
    let store = findStore(stores, parsed, cnpj);
    if (!store) {
      store = {
        id: nextId(),
        label: purchase.storeName,
        brand: parsed.brand,
        branch: parsed.branch,
        ...(cnpj ? { cnpj } : {}),
      };
      stores.push(store);
    } else if (cnpj && !store.cnpj) {
      store.cnpj = cnpj;
    }
    assignments.push({ purchaseId: purchase.id, storeId: store.id });
  }

  refreshLabels(stores, ordered, assignments);
  const used = new Set(assignments.map((assignment) => assignment.storeId));
  return {
    stores: stores.filter((store) => used.has(store.id)),
    assignments,
  };
}

export function linkIncomingPurchase(
  history: PurchaseIdentity[],
  existingStores: StoreRecord[],
  incoming: PurchaseIdentity,
  createId?: () => string,
): IncomingLink {
  const result = resolvePurchases([...history, incoming], existingStores, createId);
  const assignment = result.assignments.find((item) => item.purchaseId === incoming.id);
  if (!assignment) {
    throw new Error("A compra recebida não foi resolvida para uma loja.");
  }
  return {
    storeId: assignment.storeId,
    storeName: incoming.storeName,
    stores: result.stores,
  };
}

export function formatReconciliationReport(
  purchases: PurchaseIdentity[],
  result: ResolveResult,
): string {
  const namesByStore = new Map<string, string[]>();
  for (const purchase of purchases) {
    const storeId = result.assignments.find((item) => item.purchaseId === purchase.id)?.storeId;
    if (!storeId) continue;
    const names = namesByStore.get(storeId) ?? [];
    if (!names.includes(purchase.storeName)) names.push(purchase.storeName);
    namesByStore.set(storeId, names);
  }

  const lines = [
    `Compras lidas: ${purchases.length}`,
    `Lojas mantidas: ${result.stores.length}`,
  ];
  for (const store of result.stores) {
    lines.push(store.label);
    for (const name of namesByStore.get(store.id) ?? []) {
      lines.push(`  - ${name}`);
    }
  }
  return lines.join("\n");
}
