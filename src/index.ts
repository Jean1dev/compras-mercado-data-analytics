import "dotenv/config";
import { connectDB, disconnectDB } from "./db.js";
import { extractReceipt } from "./extractReceipt.js";
import { Purchase } from "./models/Purchase.js";
import { Item } from "./models/Item.js";
import type { ExtractedReceipt } from "./types.js";

/** Imprime um resumo legível da compra no console. */
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
    const receipt = await extractReceipt(imagePath);

    // Cria a compra primeiro para obter o _id que os itens vão referenciar.
    const purchase = await Purchase.create({
      storeName: receipt.storeName,
      storeCnpj: receipt.storeCnpj ?? undefined,
      purchaseDate: receipt.purchaseDate ? new Date(receipt.purchaseDate) : new Date(),
      totalAmount: receipt.totalAmount,
      imagePath,
      items: [],
    });

    // Cria os itens vinculados à compra.
    const items = await Item.insertMany(
      receipt.items.map((item) => ({ ...item, purchaseId: purchase._id })),
    );

    // Atualiza a compra com as referências aos itens.
    purchase.items = items.map((item) => item._id);
    await purchase.save();

    printSummary(receipt);
    console.log(`✓ Persistido: compra ${purchase._id} com ${items.length} itens.`);
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error("\n✗ Erro:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
