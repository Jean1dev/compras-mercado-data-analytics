import { Purchase } from "./models/Purchase.js";
import { resolvePurchases, type PurchaseIdentity } from "./storeIdentity.js";

/** Erro de mês fora do formato esperado (YYYY-MM). Mapeado para HTTP 400. */
export class InvalidMonthError extends Error {
  constructor(received: string) {
    super(`Mês inválido: "${received}". Formato esperado: YYYY-MM (ex.: 2026-06).`);
    this.name = "InvalidMonthError";
  }
}

export interface StoreSpending {
  storeName: string;
  total: number;
  purchaseCount: number;
  averageTicket: number;
}

export interface CategorySpending {
  category: string;
  total: number;
  percentage: number; // % sobre a soma dos itens do mês
  itemCount: number;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  range: { start: string; end: string }; // ISO 8601
  totalSpent: number;
  purchaseCount: number;
  averageTicket: number;
  itemCount: number;
  topStore: StoreSpending | null;
  storeRanking: StoreSpending[];
  spendingByCategory: CategorySpending[];
}

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Arredonda para 2 casas decimais (dinheiro/percentual). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calcula o intervalo [início do mês, início do mês seguinte) em UTC.
 * Lança `InvalidMonthError` se o formato não for `YYYY-MM`.
 */
export function getMonthRange(month: string): { start: Date; end: Date } {
  if (!MONTH_REGEX.test(month)) {
    throw new InvalidMonthError(month);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1)); // primeiro dia do mês seguinte
  return { start, end };
}

export interface PurchaseForRanking extends PurchaseIdentity {
  totalAmount: number;
}

interface CategoryAggregateRow {
  _id: string;
  total: number;
  itemCount: number;
}

export function rankStores(
  purchases: PurchaseForRanking[],
  month: string,
): Pick<
  MonthlyReport,
  "totalSpent" | "purchaseCount" | "averageTicket" | "topStore" | "storeRanking"
> {
  const { start, end } = getMonthRange(month);
  const resolved = resolvePurchases(purchases);
  const storeById = new Map(resolved.stores.map((store) => [store.id, store]));
  const assignmentByPurchase = new Map(
    resolved.assignments.map((assignment) => [assignment.purchaseId, assignment.storeId]),
  );
  const totals = new Map<string, { total: number; count: number }>();

  for (const purchase of purchases) {
    const time = purchase.purchaseDate.getTime();
    if (time < start.getTime() || time >= end.getTime()) continue;
    const storeId = assignmentByPurchase.get(purchase.id);
    if (!storeId) continue;
    const row = totals.get(storeId) ?? { total: 0, count: 0 };
    row.total += purchase.totalAmount;
    row.count += 1;
    totals.set(storeId, row);
  }

  const storeRanking: StoreSpending[] = [...totals.entries()]
    .map(([storeId, row]) => ({
      storeName: storeById.get(storeId)?.label ?? "",
      total: round2(row.total),
      purchaseCount: row.count,
      averageTicket: round2(row.count ? row.total / row.count : 0),
    }))
    .sort(
      (left, right) => right.total - left.total || left.storeName.localeCompare(right.storeName),
    );

  const totalSpent = round2([...totals.values()].reduce((sum, row) => sum + row.total, 0));
  const purchaseCount = storeRanking.reduce((sum, row) => sum + row.purchaseCount, 0);

  return {
    totalSpent,
    purchaseCount,
    averageTicket: round2(purchaseCount ? totalSpent / purchaseCount : 0),
    topStore: storeRanking[0] ?? null,
    storeRanking,
  };
}

/**
 * Gera o relatório consolidado de um mês (`YYYY-MM`) a partir das compras
 * persistidas no MongoDB. Mês sem compras retorna totais zerados (não quebra).
 */
export async function generateMonthlyReport(month: string): Promise<MonthlyReport> {
  const { start, end } = getMonthRange(month);
  const match = { purchaseDate: { $gte: start, $lt: end } };

  const [purchaseDocs, categoryRows] = await Promise.all([
    Purchase.find().select("storeName storeCnpj purchaseDate totalAmount").lean(),
    Purchase.aggregate<CategoryAggregateRow>([
      { $match: match },
      {
        $lookup: {
          from: "items",
          localField: "_id",
          foreignField: "purchaseId",
          as: "itemDocs",
        },
      },
      { $unwind: "$itemDocs" },
      {
        $group: {
          _id: "$itemDocs.category",
          total: { $sum: "$itemDocs.totalPrice" },
          itemCount: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
  ]);

  const ranked = rankStores(
    purchaseDocs.map((doc) => ({
      id: String(doc._id),
      storeName: doc.storeName,
      storeCnpj: doc.storeCnpj ?? null,
      purchaseDate: new Date(doc.purchaseDate),
      totalAmount: doc.totalAmount,
    })),
    month,
  );
  const itemCount = categoryRows.reduce((sum, row) => sum + row.itemCount, 0);

  // Base do percentual: soma dos itens (pode divergir levemente de totalSpent
  // por arredondamentos/descontos do cupom; o % por categoria fica consistente).
  const itemsTotal = categoryRows.reduce((sum, row) => sum + row.total, 0);
  const spendingByCategory: CategorySpending[] = categoryRows.map((row) => ({
    category: row._id,
    total: round2(row.total),
    percentage: itemsTotal ? round2((row.total / itemsTotal) * 100) : 0,
    itemCount: row.itemCount,
  }));

  return {
    month,
    range: { start: start.toISOString(), end: end.toISOString() },
    ...ranked,
    itemCount,
    spendingByCategory,
  };
}
