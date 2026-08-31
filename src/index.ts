// Sentry precisa ser inicializado antes de qualquer outro módulo.
import "./instrument.js";
import "dotenv/config";
import * as Sentry from "@sentry/node";
import { connectDB, disconnectDB } from "./db.js";
import { processAndSave } from "./processAndSave.js";
import type { ExtractedReceipt } from "./types.js";

function printSummary(receipt: ExtractedReceipt): void {
  console.log("\n──────────────── RESUMO DA COMPRA ────────────────");
  console.log(`Loja:  ${receipt.storeName}`);
  if (receipt.storeCnpj) console.log(`CNPJ:  ${receipt.storeCnpj}`);
  console.log(`Data:  ${receipt.purchaseDate ?? "(não identificada)"}`);
  console.log(`Total: R$ ${receipt.totalAmount.toFixed(2)}`);
  console.log(`Itens: ${receipt.items.length}`);
  console.log("───────────────────────────────────────────────────");
  for (const item of receipt.items) {
    const qty = `${item.quantity}${item.unit}`.padEnd(8);
    const price = `R$ ${item.totalPrice.toFixed(2)}`.padStart(10);
    console.log(
      `  ${qty} ${item.normalizedName.padEnd(28)} ${price}  [${item.category}]`,
    );
  }
  console.log("───────────────────────────────────────────────────\n");
}

async function main(): Promise<void> {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error("Uso: npm run dev /caminho/absoluto/para/foto_cupom.jpg");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY não definida. Configure-a no arquivo .env (veja .env.example).",
    );
    process.exit(1);
  }

  await connectDB();

  try {
    console.log(`Extraindo dados do cupom: ${imagePath}`);
    const result = await processAndSave([imagePath]);
    printSummary(result.receipt);
    console.log(`✓ Persistido: compra ${result.purchaseId} com ${result.itemCount} itens.`);
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
