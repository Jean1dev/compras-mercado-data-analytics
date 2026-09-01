export const MAX_RECEIPT_IMAGES = 10;

export interface ReceiptRequestInput {
  imageUrl?: unknown;
  imageUrls?: unknown;
  webhookUrl?: unknown;
}

export type ReceiptRequestValidation =
  | { ok: true; imageUrls: string[]; webhookUrl: string }
  | { ok: false; error: string };

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function validateReceiptRequest(body: ReceiptRequestInput): ReceiptRequestValidation {
  const hasImageUrl = body.imageUrl !== undefined;
  const hasImageUrls = body.imageUrls !== undefined;

  if (hasImageUrl && hasImageUrls) {
    return { ok: false, error: "imageUrl and imageUrls cannot be used together" };
  }

  let imageUrls: string[];
  if (hasImageUrls) {
    if (!Array.isArray(body.imageUrls) || body.imageUrls.length === 0) {
      return { ok: false, error: "imageUrls must be a non-empty array" };
    }
    if (body.imageUrls.length > MAX_RECEIPT_IMAGES) {
      return { ok: false, error: `imageUrls supports at most ${MAX_RECEIPT_IMAGES} images` };
    }
    if (body.imageUrls.some((value) => typeof value !== "string" || !value)) {
      return { ok: false, error: "every imageUrls entry must be a non-empty string" };
    }
    imageUrls = body.imageUrls as string[];
  } else if (typeof body.imageUrl === "string" && body.imageUrl) {
    imageUrls = [body.imageUrl];
  } else {
    return { ok: false, error: "imageUrl or imageUrls is required" };
  }

  if (imageUrls.some((url) => !isValidUrl(url))) {
    return { ok: false, error: "every image URL must be valid" };
  }
  if (typeof body.webhookUrl !== "string" || !body.webhookUrl) {
    return { ok: false, error: "webhookUrl is required" };
  }
  if (!isValidUrl(body.webhookUrl)) {
    return { ok: false, error: "webhookUrl is not a valid URL" };
  }

  return { ok: true, imageUrls, webhookUrl: body.webhookUrl };
}
