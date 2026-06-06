import mongoose from "mongoose";

/**
 * Conecta ao MongoDB usando a variável de ambiente MONGODB_URI.
 * Lança erro claro se a variável não estiver definida.
 */
export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI não definida. Configure-a no arquivo .env (veja .env.example).",
    );
  }
  await mongoose.connect(uri);
  console.log("✓ Conectado ao MongoDB");
}

/** Encerra a conexão com o MongoDB. */
export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
