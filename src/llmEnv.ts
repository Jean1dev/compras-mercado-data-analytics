export function validateLlmEnv(): void {
  const missing: string[] = [];
  if (!process.env.LITELLM_BASE_URL) missing.push("LITELLM_BASE_URL");
  if (!process.env.LITELLM_API_KEY) missing.push("LITELLM_API_KEY");
  if (missing.length === 0) return;

  console.error(
    `${missing.join(" e ")} não definida(s). Configure no arquivo .env (veja .env.example).`,
  );
  process.exit(1);
}
