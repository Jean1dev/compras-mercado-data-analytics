import "./instrument.js";
import * as Sentry from "@sentry/node";
import { connectDB, disconnectDB } from "./db.js";
import { reconcileSavedPurchases } from "./storeRepository.js";
import { formatReconciliationReport } from "./storeIdentity.js";

async function main(): Promise<void> {
  await connectDB();
  try {
    const { purchases, result } = await reconcileSavedPurchases();
    console.log(formatReconciliationReport(purchases, result));
  } finally {
    await disconnectDB();
  }
}

main().catch(async (err) => {
  console.error("\n✗ Erro:", err instanceof Error ? err.message : err);
  Sentry.captureException(err);
  await Sentry.flush(2000);
  process.exitCode = 1;
});
