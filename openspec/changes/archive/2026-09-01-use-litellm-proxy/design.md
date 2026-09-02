## Context

Receipt extraction lives in `src/extractReceipt.ts` and uses LangChain's `ChatAnthropic` to call Claude directly with `ANTHROPIC_API_KEY`. The rest of the app (CLI, Fastify server, MongoDB, webhooks) is provider-agnostic.

A LiteLLM instance is deployed at `https://lite-llm-deploy-production.up.railway.app/` and exposes an OpenAI-compatible `/v1/chat/completions` endpoint. The target model `anthropic/claude-sonnet-4-6` is available on that proxy with 1M input / 128K output token limits.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- Route all LLM calls through LiteLLM using `@langchain/openai` (`ChatOpenAI` + custom `baseURL`).
- Keep `anthropic/claude-sonnet-4-6` as the extraction model (same quality as today).
- Preserve structured output + text fallback extraction strategy.
- Replace env validation in entry points (`index.ts`, `server.ts`).

**Non-Goals:**

- Changing the extraction prompt, Zod schema, or category list.
- Adding model fallback chains in LiteLLM config.
- Switching to a cheaper/faster model (Haiku, GPT-4o, Gemini).
- Adding retry logic for LiteLLM network failures beyond existing extraction retries.
- Persisting LiteLLM request IDs or cost tracking in the app.

## Decisions

### 1. Use `ChatOpenAI` with LiteLLM base URL (OpenAI-compat)

**Choice:** Replace `ChatAnthropic` with `ChatOpenAI` from `@langchain/openai`, configured with:

```typescript
new ChatOpenAI({
  model: process.env.LLM_MODEL ?? "anthropic/claude-sonnet-4-6",
  apiKey: process.env.LITELLM_API_KEY,
  maxTokens: 8192,
  configuration: { baseURL: process.env.LITELLM_BASE_URL },
})
```

**Rationale:** Standard LiteLLM + LangChain integration pattern. Avoids maintaining Anthropic-specific client workarounds.

**Alternatives considered:**
- **Keep `ChatAnthropic` with custom base URL** — LiteLLM supports Anthropic-compat, but keeps the `top_p`/`top_k` workaround and couples to Anthropic SDK semantics.
- **Raw `fetch` to LiteLLM** — Drops LangChain abstractions (`withStructuredOutput`, message types); larger rewrite for no benefit.

### 2. Environment variable scheme

**Choice:**

| Variable | Example | Required |
|---|---|---|
| `LITELLM_BASE_URL` | `https://lite-llm-deploy-production.up.railway.app/v1` | Yes |
| `LITELLM_API_KEY` | `sk-...` | Yes |
| `LLM_MODEL` | `anthropic/claude-sonnet-4-6` | No (defaults to `anthropic/claude-sonnet-4-6`) |

Remove `ANTHROPIC_API_KEY` entirely.

**Rationale:** Explicit proxy config; model name is overridable without code change but defaults to current behavior.

### 3. Model identifier uses LiteLLM prefix

**Choice:** `anthropic/claude-sonnet-4-6` (not bare `claude-sonnet-4-6`).

**Rationale:** Confirmed available on the user's LiteLLM instance via `/v1/models`. LiteLLM requires the provider prefix for routing.

### 4. Keep `withStructuredOutput` + text fallback unchanged

**Choice:** No changes to extraction logic beyond `createModel()`.

**Rationale:** Minimizes regression risk. Structured output via tool calling is supported by LiteLLM for Anthropic models; existing 3-attempt retry + JSON text fallback covers edge cases.

### 5. Centralize env validation helper (optional, lightweight)

**Choice:** Extract a small `validateLlmEnv()` function or inline checks in `index.ts` and `server.ts` — same message style as today.

**Rationale:** DRY without over-engineering; two call sites only.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Structured output fails through OpenAI-compat proxy | Existing text fallback; E2E test with real receipt image after deploy |
| Extra latency from Railway hop | Acceptable for async webhook flow; monitor via LiteLLM dashboard |
| **BREAKING** env migration breaks existing deploys | Document in README; update `.env.example`; clear error messages |
| `@langchain/openai` version mismatch with `@langchain/core` | Pin compatible 0.3.x versions alongside existing core package |
| Image format differences in OpenAI-compat multimodal | Same `image_url` data URI format LangChain already uses; validate E2E |

## Migration Plan

1. Update dependencies: remove `@langchain/anthropic`, add `@langchain/openai`.
2. Refactor `createModel()` in `extractReceipt.ts`.
3. Replace env checks in `index.ts` and `server.ts`.
4. Update `.env.example`, `README.md`, `SPECS.md`.
5. **Deploy:** set `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LLM_MODEL` in Railway; remove `ANTHROPIC_API_KEY`.
6. **Verify:** run CLI with a known receipt image; trigger `POST /receipts` and confirm webhook payload.
7. **Rollback:** revert code deploy and restore `ANTHROPIC_API_KEY` if LiteLLM proxy is unavailable.

## Open Questions

_None — model choice (`anthropic/claude-sonnet-4-6`) and LiteLLM URL confirmed during exploration._
