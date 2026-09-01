## Why

O projeto chama a API da Anthropic diretamente via `@langchain/anthropic`, exigindo que cada ambiente configure `ANTHROPIC_API_KEY` e dificultando centralização de chaves, observabilidade e rotação de credenciais. Já existe uma instância LiteLLM no Railway que pode servir como proxy unificado; migrar para ela reduz acoplamento ao provider e alinha o app ao gateway de LLM da organização.

## What Changes

- Substituir `ChatAnthropic` por `ChatOpenAI` apontando para o LiteLLM (endpoint OpenAI-compat).
- Trocar `ANTHROPIC_API_KEY` por `LITELLM_BASE_URL`, `LITELLM_API_KEY` e `LLM_MODEL`.
- Manter o mesmo modelo de extração: `anthropic/claude-sonnet-4-6` (equivalente LiteLLM ao `claude-sonnet-4-6` usado hoje).
- Remover dependência `@langchain/anthropic` e adicionar `@langchain/openai`.
- Remover workaround `invocationKwargs` de `top_p`/`top_k` (específico do pacote Anthropic).
- Atualizar `.env.example`, `README.md` e `SPECS.md`.
- **BREAKING**: deploys existentes precisam migrar variáveis de ambiente (`ANTHROPIC_API_KEY` deixa de ser usada).

## Capabilities

### New Capabilities

- `receipt-extraction`: Extração multimodal de cupons fiscais via LLM — requisitos de configuração, autenticação e invocação do modelo passam a exigir LiteLLM em vez de Anthropic direto.

### Modified Capabilities

_(nenhuma — não há specs existentes no repositório)_

## Impact

- **Código**: `src/extractReceipt.ts` (cliente LLM), `src/index.ts` e `src/server.ts` (validação de env).
- **Dependências**: `@langchain/anthropic` → `@langchain/openai`.
- **Configuração**: `.env.example`; ambientes de produção/staging no Railway.
- **Comportamento externo**: inalterado para consumidores (CLI, `POST /receipts`, webhooks) — mesma qualidade esperada com o mesmo modelo.
- **Fora de escopo**: troca de modelo, fallback automático entre providers, retry de webhook.
