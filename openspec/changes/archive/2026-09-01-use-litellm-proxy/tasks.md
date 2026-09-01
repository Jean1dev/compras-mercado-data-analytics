## 1. Dependencies

- [x] 1.1 Remove `@langchain/anthropic` and add `@langchain/openai` (^0.3.x) in `package.json`, then run `npm install` and verify both packages resolve without peer dependency errors
- [x] 1.2 Run `npx tsc --noEmit` after dependency swap to confirm no broken imports from the removed package

## 2. LLM client migration

- [x] 2.1 Refactor `createModel()` in `src/extractReceipt.ts` to use `ChatOpenAI` with `LITELLM_BASE_URL`, `LITELLM_API_KEY`, and `LLM_MODEL` (default `anthropic/claude-sonnet-4-6`); remove `invocationKwargs` workaround and verify `npx tsc --noEmit` passes
- [x] 2.2 Confirm `extractWithStructuredOutput` and `extractWithTextFallback` compile unchanged (only `createModel()` import/type changes) and verify no remaining `@langchain/anthropic` imports in the codebase

## 3. Environment validation

- [x] 3.1 Replace `ANTHROPIC_API_KEY` check in `src/index.ts` with validation for `LITELLM_BASE_URL` and `LITELLM_API_KEY`; verify running CLI without env vars prints a clear error and exits with code 1
- [x] 3.2 Replace `ANTHROPIC_API_KEY` check in `src/server.ts` with the same LiteLLM env validation; verify `npm run serve` without env vars fails at startup with a clear message

## 4. Configuration and documentation

- [x] 4.1 Update `.env.example` with `LITELLM_BASE_URL`, `LITELLM_API_KEY`, and `LLM_MODEL=anthropic/claude-sonnet-4-6`; remove `ANTHROPIC_API_KEY`
- [x] 4.2 Update `README.md` and `SPECS.md` to reflect LiteLLM proxy, new env vars, and **BREAKING** migration note from `ANTHROPIC_API_KEY`

## 5. Verification

- [ ] 5.1 Configure local `.env` with LiteLLM credentials and run `npm run dev <receipt-image>`; verify extraction succeeds and items are persisted to MongoDB
- [ ] 5.2 Trigger `POST /receipts` with a test image URL and confirm webhook events (`storeName`, `totalAmount`, `itemCount`, `completed`) arrive with the expected shape
