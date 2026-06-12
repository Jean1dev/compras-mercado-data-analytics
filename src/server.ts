import "dotenv/config";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import Fastify from "fastify";
import { connectDB } from "./db.js";
import { processAndSave } from "./processAndSave.js";

const app = Fastify({ logger: true });

app.post("/receipts", async (request, reply) => {
  const body = request.body as Record<string, unknown>;
  const imageUrl = body?.imageUrl;

  if (typeof imageUrl !== "string" || !imageUrl) {
    return reply.status(400).send({ error: "imageUrl is required" });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return reply.status(400).send({ error: "imageUrl is not a valid URL" });
  }

  const ext = extname(parsedUrl.pathname) || ".jpg";
  const tempPath = join(tmpdir(), `receipt_${Date.now()}${ext}`);

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return reply
        .status(400)
        .send({ error: `Falha ao baixar imagem: ${response.status} ${response.statusText}` });
    }

    const buffer = await response.arrayBuffer();
    await writeFile(tempPath, Buffer.from(buffer));

    const result = await processAndSave(tempPath);

    return reply.send({
      purchaseId: result.purchaseId,
      itemCount: result.itemCount,
      receipt: result.receipt,
    });
  } finally {
    await unlink(tempPath).catch(() => {});
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

start().catch((err) => {
  console.error("Erro ao iniciar servidor:", err);
  process.exit(1);
});
