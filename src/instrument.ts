import "dotenv/config";
import * as Sentry from "@sentry/node";

// DSN padrão do projeto. Pode ser sobrescrito pela variável de ambiente SENTRY_DSN.
const DEFAULT_DSN =
  "https://7d62018d2443be404d11a9ff4ca0c7b3@o318666.ingest.us.sentry.io/4511598391721984";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? DEFAULT_DSN,
  environment: process.env.NODE_ENV ?? "development",
  // Captura 100% das transações de performance.
  tracesSampleRate: 1.0,
  // Anexa o stack trace também em mensagens capturadas.
  attachStacktrace: true,
});
