## 1. Resolution

- [x] 1.1 Add a pure store-resolution module (fold, legal-token removal, branch split with `li` → `l1`, local Jaro-Winkler) and verify `npm test` passes scenarios for the four Moniari spellings as one store, `Atacadão S.A.` with `ATACADAO S/A`, `L1` apart from `L2`, Içara apart from Criciúma, and RH, Giassi, and Atacadão apart from each other
- [x] 1.2 Extend that module with CNPJ check digits, the bare-name rule, stable store ids, and the most-frequent label, and verify `npm test` covers same CNPJ merging, different CNPJs staying apart, invalid CNPJ falling through to the name, a bare `GIASSI` joining only Içara, a bare `GIASSI` staying apart when both cities exist, cross-month Woniari/Moniari, and the label moving to `MONIARI SUPERMERCADOS LTDA L1` without changing the id

## 2. Persistence

- [x] 2.1 Add the `Store` model (`label`, `brand`, `branch`, optional `cnpj`) and optional `Purchase.storeId`, and verify a model test accepts a purchase that keeps the raw `storeName` while holding a store reference, and `npx tsc --noEmit` passes

## 3. Save path

- [x] 3.1 Link the store inside `processAndSave` via the shared resolver, creating a store on the first sighting and reusing it for an alias, and verify a test of that link step shows the second spelling reuses the assignment while the stored and returned `storeName` stay the extracted text (`Woniari Supermercados Ltda L1`)

## 4. Monthly report

- [x] 4.1 Group `storeRanking` and `topStore` by resolved store across the whole history, including purchases with no `storeId`, leaving category totals and the JSON field names unchanged, and verify a test of the Moniari month returns one row named `MONIARI SUPERMERCADOS LTDA L1` with total 363.74, purchaseCount 6, and averageTicket 60.62

## 5. Correction command

- [x] 5.1 Add `npm run reconcile-stores` (`tsx src/reconcileStores.ts`) that persists the same assignments, refreshes labels, drops stores with no purchases, and prints purchases scanned, stores kept, and the raw names in each store; verify a planner test is idempotent on a second run with no new purchases, and verify `src/server.ts` still registers only `POST /receipts` and `GET /reports/:month`

## 6. Documentation

- [x] 6.1 Document `npm run reconcile-stores` in `README.md` and verify the command and the note that it corrects purchases already saved both appear there
