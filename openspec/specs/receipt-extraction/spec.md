## Purpose

Extrair dados estruturados de cupons fiscais de supermercado a partir de imagens, usando um modelo de linguagem multimodal roteado via proxy LiteLLM.

## Requirements

### Requirement: LLM configuration via LiteLLM

The system SHALL route all receipt-extraction LLM calls through a LiteLLM proxy using an OpenAI-compatible API. The system MUST require `LITELLM_BASE_URL` and `LITELLM_API_KEY` at startup. The system MUST NOT require or use `ANTHROPIC_API_KEY`.

#### Scenario: Startup with valid LiteLLM configuration

- **WHEN** the application starts with `LITELLM_BASE_URL` and `LITELLM_API_KEY` defined
- **THEN** the application proceeds to process receipt extraction requests

#### Scenario: Startup without LiteLLM configuration

- **WHEN** the application starts without `LITELLM_API_KEY` or `LITELLM_BASE_URL`
- **THEN** the application exits with a clear error message indicating which variables are missing

### Requirement: Default extraction model

The system SHALL use `anthropic/claude-sonnet-4-6` as the default value for `LLM_MODEL` when the variable is not explicitly set. The configured model MUST support multimodal input (image + text).

#### Scenario: Model not overridden in environment

- **WHEN** `LLM_MODEL` is not set in the environment
- **THEN** receipt extraction invokes `anthropic/claude-sonnet-4-6` through the LiteLLM proxy

### Requirement: Multimodal receipt extraction

The system SHALL accept one or more receipt images and return a validated structured receipt object containing store metadata and line items. Extraction MUST support the same input formats as before: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.

#### Scenario: Single-image extraction succeeds

- **WHEN** a valid receipt image is provided
- **THEN** the system returns an `ExtractedReceipt` with store name, total amount, and at least one item

#### Scenario: Multi-image extraction succeeds

- **WHEN** multiple images of the same receipt are provided in order
- **THEN** the system returns a single merged `ExtractedReceipt` without duplicating overlapping items

### Requirement: Structured output with fallback

The system SHALL attempt structured output extraction first and MUST fall back to plain-text JSON parsing when structured output fails after retries.

#### Scenario: Structured output succeeds

- **WHEN** the LLM returns a valid structured response on the first or a retried attempt
- **THEN** the system validates the result against the receipt schema and returns it without using the text fallback

#### Scenario: Structured output fails and fallback succeeds

- **WHEN** structured output exhausts all retry attempts without a valid result
- **THEN** the system attempts text-based JSON extraction and returns a validated `ExtractedReceipt` if parsing succeeds

#### Scenario: All extraction strategies fail

- **WHEN** both structured output and text fallback fail
- **THEN** the system returns an error describing the failure

### Requirement: Extraction behavior unchanged for consumers

The HTTP API (`POST /receipts`), CLI, webhooks, and MongoDB persistence MUST produce the same externally observable outcomes as before this change, given equivalent receipt images and a healthy LiteLLM proxy.

#### Scenario: API consumer receives same webhook shape

- **WHEN** a receipt job completes successfully via `POST /receipts`
- **THEN** the webhook events (`storeName`, `totalAmount`, `itemCount`, `completed`) contain the same fields and structure as prior to the LiteLLM migration
