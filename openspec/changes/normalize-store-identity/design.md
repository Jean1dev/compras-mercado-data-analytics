## Context

A purchase stores `storeName` and an optional `storeCnpj` exactly as extracted. `generateMonthlyReport` groups with `$group` on `$storeName`. `processAndSave` writes the receipt fields and does not know about a store entity. The Fastify server has no authentication. Jaro-Winkler is not a dependency today; tests run with `node:test` via `tsx`.

See `proposal.md` for why the ranking is split. Behavior is fixed in `specs/store-identity/spec.md`.

## Goals / Non-Goals

**Goals:**

- One resolution function used when saving a purchase, when building the monthly report, and when correcting purchases already in MongoDB.
- The four Moniari spellings in the current ranking become one store; `L2` and a second Giassi city stay separate.
- The report is correct before the correction command runs, and stays correct after it.

**Non-Goals:**

- A manual merge UI or an HTTP trigger for the backfill.
- Rewriting `storeName`, changing the webhook payload, or adding fields to `GET /reports/:month`.
- Product-name identity and receipt deduplication.

## Decisions

### Store document, opaque id

Add a `Store` model (`label`, `brand`, `branch`, optional `cnpj`) and `Purchase.storeId` as an optional reference. The id is the store's `_id`, not a string derived from the first spelling, so a first cupom read as `Woniari` does not freeze the key. `storeName` on the purchase stays as printed.

`brand` and `branch` are the match keys. `cnpj`, when present, is the 14-digit form that passed the check digits. `label` is refreshed from purchase counts whenever a purchase is linked.

Alternative: overwrite `storeName` in place. Rejected because the printed text is the evidence, and the webhook still has to send it.

### Resolution order

Walk purchases by `purchaseDate`, then `_id`. For each name:

1. Fold: NFD, strip marks, lowercase, turn punctuation into spaces, collapse whitespace. Drop tokens `ltda`, `sa`, `me`, `epp`, `eireli`, `supermercado`, `supermercados`, `mercado`. Also drop a trailing token pair `s` + `a`, so `S.A.` and `S/A` become nothing rather than two leftover letters.
2. If the last token matches `l` plus digits or `li`, it is a branch code and `li` becomes `l1`. Otherwise, if more than one token remains, the last token is the branch (the city) and the rest is the trade name. A single token is the trade name with an empty branch.
3. Match:
   - same usable CNPJ → that store;
   - a different usable CNPJ blocks a name match;
   - else same branch and trade-name Jaro-Winkler ≥ 0.88 → that store (highest score, then earliest store);
   - else empty branch and exactly one store whose trade name scores ≥ 0.88 → that store;
   - else create a store.

Jaro-Winkler is implemented in the repo (match window `floor(max/2) - 1`, prefix cap 4, `p = 0.1`). No new package. The measured score of `woniari` against `moniari` is about 0.900, so the threshold is 0.88 and not 0.90. Full-string Jaro-Winkler was rejected: `L1` against `L2` scores 0.986, above the OCR pair we need to merge.

On a match, copy a usable CNPJ onto the store when the store does not have one yet. Refresh `label` as the raw `storeName` with the most purchases; ties take the earliest purchase.

### Same function in three places

`resolvePurchases` is pure: ordered identity rows in, store assignments out. Callers:

- `processAndSave` loads existing stores, resolves the new receipt against them, creates the store when needed, and saves `storeId` on the purchase.
- `generateMonthlyReport` loads identity fields for every purchase (not only the month), resolves, then aggregates the month by store id. Category aggregation is unchanged. Unlinked history still collapses, which is what the ranking needs before the command runs. Household volume makes a full scan acceptable.
- The correction command persists the assignments that the report already computes in memory.

The report response keeps today's fields. `storeName` in `storeRanking` and `topStore` is the label.

### Correction is a script

`npm run reconcile-stores` runs `tsx src/reconcileStores.ts`. It connects with `MONGODB_URI`, resolves every purchase in date order, writes `storeId`, refreshes labels, deletes stores left with no purchases, and prints purchases scanned, stores kept, and the raw names inside each store. A second run with no new purchases writes the same links.

There is no HTTP route. The server does not authenticate callers, and relinking is a migration, not a user action. The ranking the UI already reads is `GET /reports/:month`; once resolution runs inside that handler, the four Moniari rows collapse without a new endpoint. The script only persists the link so later queries can group on `storeId`.

Alternative considered: `POST /stores/reconcile`. Rejected for this change. The pure function stays easy to wrap in a route later, behind authentication, if a button is ever needed.

## Risks / Trade-offs

- [A trade name that scores ≥ 0.88 against the wrong chain] → The known gap on the trade-name token is wide (`moniari`/`woniari` ≈ 0.90, `moniari`/`giassi` ≈ 0.64, `rh`/`rj` = 0.70). Tests lock the print and the branch counterexamples. A future collision gets a new fixture rather than a lower threshold.
- [Report reads every purchase] → Fine at household scale. Revisit if the collection grows past a full scan per request.
- [A purchase is saved and the process dies before `storeId` is set] → The report still groups it on read. The script persists the link later.
- [CNPJ digits are misread but still check-valid] → Rare, and it would split or merge against the name. Invalid check digits are ignored on purpose so a one-digit OCR error falls through to the name.
- [Bare `GIASSI` with two cities becomes a third store] → Specified. It does not pick a city by guesswork.

## Migration Plan

1. Deploy the resolution, the save path, and the report change. The ranking collapses on the next `GET /reports/:month` even though old documents have no `storeId`.
2. Run `npm run reconcile-stores` once against `MONGODB_URI`. New purchases already write `storeId`; the script covers history and is safe to repeat.
3. Rollback is reverting the app. `storeId` and `Store` documents are additive; grouping by the raw name returns if the report change is reverted. No need to unset the field.

## Open Questions

None. The script-versus-endpoint choice is settled above.
