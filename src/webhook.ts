import * as Sentry from "@sentry/node";
import type { ExtractedReceipt } from "./types.js";

export type WebhookPayload =
  | {
      jobId: string;
      status: "completed";
      purchaseId: string;
      itemCount: number;
      receipt: ExtractedReceipt;
    }
  | {
      jobId: string;
      status: "failed";
      error: string;
    };

/**
 * Envia o resultado do processamento para a URL de callback informada pelo
 * cliente. Falhas no envio são logadas e reportadas ao Sentry, mas não
 * derrubam o processo em background — o job já terminou (com sucesso ou
 * erro) independentemente da entrega do webhook.
 */
export async function sendWebhook(webhookUrl: string, payload: WebhookPayload): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook respondeu com status ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error(`✗ Falha ao enviar webhook para ${webhookUrl}:`, err);
    Sentry.captureException(err);
  }
}
