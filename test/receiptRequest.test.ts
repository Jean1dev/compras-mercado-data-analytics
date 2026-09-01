import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RECEIPT_IMAGES, validateReceiptRequest } from "../src/receiptRequest.js";

const webhookUrl = "https://example.com/webhook";

test("normaliza imageUrl legado como uma lista", () => {
  assert.deepEqual(
    validateReceiptRequest({ imageUrl: "https://example.com/receipt.jpg", webhookUrl }),
    {
      ok: true,
      imageUrls: ["https://example.com/receipt.jpg"],
      webhookUrl,
    },
  );
});

test("aceita e preserva a ordem de múltiplas imagens", () => {
  const imageUrls = [
    "https://example.com/page-1.jpg",
    "https://example.com/page-2.png",
  ];
  assert.deepEqual(validateReceiptRequest({ imageUrls, webhookUrl }), {
    ok: true,
    imageUrls,
    webhookUrl,
  });
});

test("rejeita imageUrl e imageUrls juntos", () => {
  const result = validateReceiptRequest({
    imageUrl: "https://example.com/receipt.jpg",
    imageUrls: ["https://example.com/receipt.jpg"],
    webhookUrl,
  });
  assert.equal(result.ok, false);
});

test("rejeita lista vazia, URLs inválidas e mais de dez imagens", () => {
  const invalidRequests = [
    { imageUrls: [], webhookUrl },
    { imageUrls: ["not-a-url"], webhookUrl },
    {
      imageUrls: Array.from(
        { length: MAX_RECEIPT_IMAGES + 1 },
        (_, index) => `https://example.com/${index}.jpg`,
      ),
      webhookUrl,
    },
  ];

  for (const request of invalidRequests) {
    assert.equal(validateReceiptRequest(request).ok, false);
  }
});

test("rejeita webhook ausente ou inválido", () => {
  assert.equal(
    validateReceiptRequest({ imageUrl: "https://example.com/receipt.jpg" }).ok,
    false,
  );
  assert.equal(
    validateReceiptRequest({
      imageUrl: "https://example.com/receipt.jpg",
      webhookUrl: "not-a-url",
    }).ok,
    false,
  );
});
