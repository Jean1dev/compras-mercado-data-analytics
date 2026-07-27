// Sentry precisa ser inicializado antes de qualquer outro módulo.
import "./instrument.js";
import "dotenv/config";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import Fastify from "fastify";
import { connectDB } from "./db.js";
import { processAndSave } from "./processAndSave.js";
import { generateMonthlyReport, InvalidMonthError } from "./monthlyReport.js";
import { sendWebhook } from "./webhook.js";

const app = Fastify({ logger: true });

// Registra o handler de erros do Sentry para capturar exceções das rotas.
Sentry.setupFastifyErrorHandler(app);

/**
 * Baixa a imagem, extrai e persiste os dados do cupom, e notifica o
 * resultado via webhook. Roda em background, desacoplado da resposta HTTP
 * já enviada ao cliente — erros aqui viram um webhook de falha, nunca uma
 * exceção não tratada.
 */
async function processReceiptJob(
  jobId: string,
  imageUrl: string,
  webhookUrl: string,
): Promise<void> {
  const ext = extname(new URL(imageUrl).pathname) || ".jpg";
  const tempPath = join(tmpdir(), `receipt_${jobId}${ext}`);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar imagem: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await writeFile(tempPath, Buffer.from(buffer));

    const result = await processAndSave(tempPath);

    await sendWebhook(webhookUrl, {
      jobId,
      event: "storeName",
      storeName: result.receipt.storeName,
    });
    await sendWebhook(webhookUrl, {
      jobId,
      event: "totalAmount",
      totalAmount: result.receipt.totalAmount,
    });
    await sendWebhook(webhookUrl, {
      jobId,
      event: "itemCount",
      itemCount: result.itemCount,
    });
    await sendWebhook(webhookUrl, {
      jobId,
      event: "completed",
      purchaseId: result.purchaseId,
      itemCount: result.itemCount,
      receipt: result.receipt,
    });
  } catch (err) {
    console.error(`✗ Erro ao processar job ${jobId}:`, err);
    Sentry.captureException(err);
    await sendWebhook(webhookUrl, {
      jobId,
      event: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

app.post("/receipts", async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  const imageUrl = body?.imageUrl;
  const webhookUrl = body?.webhookUrl;

  if (typeof imageUrl !== "string" || !imageUrl) {
    return reply.status(400).send({ error: "imageUrl is required" });
  }

  if (typeof webhookUrl !== "string" || !webhookUrl) {
    return reply.status(400).send({ error: "webhookUrl is required" });
  }

  try {
    new URL(imageUrl);
  } catch {
    return reply.status(400).send({ error: "imageUrl is not a valid URL" });
  }

  try {
    new URL(webhookUrl);
  } catch {
    return reply.status(400).send({ error: "webhookUrl is not a valid URL" });
  }

  const jobId = randomUUID();

  void processReceiptJob(jobId, imageUrl, webhookUrl);

  return reply.status(202).send({ jobId, status: "accepted" });
});

app.get("/reports/:month", async (request, reply) => {
  const { month } = request.params as { month: string };

  try {
    const report = await generateMonthlyReport(month);
    return reply.send(report);
  } catch (err) {
    if (err instanceof InvalidMonthError) {
      return reply.status(400).send({ error: err.message });
    }
    throw err;
  }
});

async function start(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY não definida. Configure-a no arquivo .env.");
    process.exit(1);
  }

  await connectDB();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

start().catch(async (err) => {
  console.error("Erro ao iniciar servidor:", err);
  Sentry.captureException(err);
  await Sentry.flush(2000);
  process.exit(1);
});
