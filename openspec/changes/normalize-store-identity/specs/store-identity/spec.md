## Purpose

Dar a cada estabelecimento uma identidade estável, para que grafias diferentes do mesmo cupom contem como uma loja no histórico e no relatório mensal.

## ADDED Requirements

### Requirement: Raw store name is preserved

The system MUST persist the store name extracted from the receipt. The system MUST NOT replace that stored name with a canonical label.

#### Scenario: Alias is saved as printed

- **WHEN** a receipt is saved with store name `Woniari Supermercados Ltda L1`
- **THEN** the purchase keeps that exact store name

### Requirement: Same establishment resolves to one store

After case-folding, accent removal, and dropping the tokens `ltda`, `sa`, `me`, `epp`, `eireli`, `supermercado`, `supermercados`, and `mercado`, the system MUST treat two names as the same store when their branch tokens are equal and the Jaro-Winkler similarity of their trade names is at least 0.88. Punctuation in legal suffixes such as `S.A.` and `S/A` MUST be folded before those tokens are dropped. The branch-code token `li` MUST equal `l1`. Resolution MUST use the whole saved history, not only purchases inside one calendar month.

#### Scenario: Case, suffix, and OCR variants collapse

- **WHEN** the saved names are `MONIARI SUPERMERCADOS LTDA L1`, `MONIARI SUPERMERCADOS LTDA LI`, `Woniari Supermercados Ltda L1`, and `Moniari Supermercados LTDA L1`
- **THEN** all four resolve to the same store

#### Scenario: Legal suffix and accents collapse

- **WHEN** the saved names are `Atacadão S.A.` and `ATACADAO S/A`
- **THEN** both resolve to the same store

#### Scenario: Variants in different months still match

- **WHEN** one month contains only `Woniari Supermercados Ltda L1` and another month contains only `MONIARI SUPERMERCADOS LTDA L1`
- **THEN** both purchases resolve to the same store

#### Scenario: Bare name joins the only known branch

- **WHEN** the only saved Giassi store is `GIASSI SUPERMERCADOS IÇARA` and a purchase arrives as `GIASSI`
- **THEN** that purchase resolves to the Içara store

### Requirement: Distinct branches stay separate

The system MUST resolve two names to different stores when the branch token differs, including a different unit code or a different city. A name with no branch token MUST NOT join a trade name that already has two or more known branches. Other chains present in the same month MUST stay on their own stores.

#### Scenario: Unit code differs

- **WHEN** the saved names are `MONIARI SUPERMERCADOS LTDA L1` and `MONIARI SUPERMERCADOS LTDA L2`
- **THEN** they resolve to two stores

#### Scenario: City differs

- **WHEN** the saved names are `GIASSI SUPERMERCADOS IÇARA` and `GIASSI SUPERMERCADOS CRICIUMA`
- **THEN** they resolve to two stores

#### Scenario: Bare name with several branches stays apart

- **WHEN** both `GIASSI SUPERMERCADOS IÇARA` and `GIASSI SUPERMERCADOS CRICIUMA` are already known and a purchase arrives as `GIASSI`
- **THEN** that purchase does not resolve to either branched store

#### Scenario: Other chains stay apart

- **WHEN** a month contains a Moniari purchase, `GIASSI SUPERMERCADOS IÇARA`, `Atacadão S.A.`, and `Supermercado RH LTDA`
- **THEN** Giassi, Atacadão, and RH each resolve to a store of their own, separate from Moniari

### Requirement: Valid CNPJ takes precedence over the name

The system MUST treat a CNPJ as usable only when it has 14 digits and valid check digits. Two purchases with the same usable CNPJ MUST resolve to the same store even when their names would not match. Two purchases with different usable CNPJs MUST resolve to different stores even when their names would match. A missing or invalid CNPJ MUST leave the decision to the name rules.

#### Scenario: Same valid CNPJ merges different spellings

- **WHEN** two purchases share a usable CNPJ and their store names would not match by the name rules
- **THEN** they resolve to the same store

#### Scenario: Different valid CNPJs stay apart

- **WHEN** two purchases have different usable CNPJs and store names that would match by the name rules
- **THEN** they resolve to different stores

#### Scenario: Invalid CNPJ falls through to the name

- **WHEN** purchases carry the four Moniari spellings and each CNPJ is null or fails the check digits
- **THEN** they still resolve to the same store

### Requirement: Canonical label is the most frequent spelling

The label of a store MUST be the raw store name with the highest purchase count among purchases of that store. A tie MUST go to the raw name on the earliest purchase. The store id MUST remain the same when a later purchase changes which spelling leads the count.

#### Scenario: Most common spelling becomes the label

- **WHEN** a store has three purchases named `MONIARI SUPERMERCADOS LTDA L1` and one purchase for each of the other three Moniari spellings
- **THEN** the label is `MONIARI SUPERMERCADOS LTDA L1`

#### Scenario: A later spelling does not change the id

- **WHEN** the first purchase is `Woniari Supermercados Ltda L1` and later purchases make `MONIARI SUPERMERCADOS LTDA L1` the most frequent spelling
- **THEN** the store id is unchanged and the label becomes `MONIARI SUPERMERCADOS LTDA L1`

### Requirement: New purchases are linked on save

The system MUST link a purchase to a resolved store as part of saving that purchase. The first unmatched purchase MUST create the store. A later matching purchase MUST reuse it.

#### Scenario: First sighting creates a store

- **WHEN** a purchase is saved and no store matches
- **THEN** a store is created and the purchase links to it

#### Scenario: Later sighting reuses a store

- **WHEN** a purchase is saved and an existing store matches
- **THEN** the purchase links to that store and no second store is created

### Requirement: Monthly report ranks resolved stores

`GET /reports/:month` MUST group `storeRanking` and `topStore` by resolved store. `storeName` in those objects MUST be the canonical label. Spent total, visit count, and average ticket MUST add up across every raw name in the store. The response field names MUST stay the same. Purchases that have no stored store link yet MUST still be grouped by the same resolution rules.

#### Scenario: Split Moniari rows become one ranking row

- **WHEN** a month contains `MONIARI SUPERMERCADOS LTDA L1` (199.39 across 3 purchases), `MONIARI SUPERMERCADOS LTDA LI` (112.42, 1 purchase), `Woniari Supermercados Ltda L1` (33.95, 1 purchase), and `Moniari Supermercados LTDA L1` (17.98, 1 purchase)
- **THEN** `storeRanking` contains one row for that store with `storeName` `MONIARI SUPERMERCADOS LTDA L1`, `total` 363.74, `purchaseCount` 6, and `averageTicket` 60.62

#### Scenario: Unlinked history still collapses

- **WHEN** those four purchases have no stored store link
- **THEN** the monthly report still returns that single combined row

### Requirement: Saved purchases are linked by a command

The system MUST provide a command that links every saved purchase to a resolved store and refreshes canonical labels. A second run without new purchases MUST leave those links and the set of stores unchanged. The command MUST print how many purchases were scanned, how many stores were resolved, and which raw names collapsed into each store. The system MUST NOT expose an HTTP route that relinks saved purchases.

#### Scenario: Command links existing purchases

- **WHEN** the command runs against purchases saved without a store link
- **THEN** each of those purchases ends linked to a store

#### Scenario: Second run is idempotent

- **WHEN** the command runs again and no purchase was added
- **THEN** store links are unchanged and no additional store is created

#### Scenario: No relink route

- **WHEN** the HTTP server is running
- **THEN** it exposes no route whose effect is to relink saved purchases

### Requirement: Receipt webhook keeps the extracted name

The `storeName` webhook event MUST carry the name extracted from the receipt, not the canonical label.

#### Scenario: Webhook uses the printed name

- **WHEN** a job completes for a receipt read as `Woniari Supermercados Ltda L1` that resolves to an existing Moniari store
- **THEN** the `storeName` webhook event contains `Woniari Supermercados Ltda L1`
