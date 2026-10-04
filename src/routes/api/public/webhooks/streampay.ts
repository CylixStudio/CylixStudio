import { createFileRoute } from "@tanstack/react-router";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataFrom(payload: Record<string, unknown>) {
  const data = asRecord(payload["data"]);
  return (
    asRecord(data?.["metadata"]) ??
    asRecord(data?.["custom_metadata"]) ??
    asRecord(payload["metadata"]) ??
    asRecord(payload["custom_metadata"]) ??
    null
  );
}

/**
 * StreamPay payment webhook.
 * Subscribe this URL to PAYMENT_SUCCEEDED and PAYMENT_MARKED_AS_PAID.
 * Path: POST /api/public/webhooks/streampay
 */
export const Route = createFileRoute("/api/public/webhooks/streampay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { fulfillProPurchase } = await import("@/lib/proPurchase.server");
        const { publicSiteUrl } = await import("@/lib/siteUrl.server");
        const { verifyStreamPaySignature } = await import("@/lib/streampay.server");
        const { supabaseAdmin, assertSupabaseAdminConfigured } = await import(
          "@/lib/supabase/client.server"
        );

        const rawBody = await request.text();
        const signature =
          request.headers.get("x-webhook-signature") ?? request.headers.get("X-Webhook-Signature");
        if (!verifyStreamPaySignature(rawBody, signature)) {
          console.warn("[streampay] invalid webhook signature");
          return Response.json({ error: "invalid_signature" }, { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          const parsed = JSON.parse(rawBody) as unknown;
          const record = asRecord(parsed);
          if (!record) return Response.json({ error: "invalid_json" }, { status: 400 });
          payload = record;
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const eventType = text(payload["event_type"]) ?? request.headers.get("x-webhook-event");
        if (eventType !== "PAYMENT_SUCCEEDED" && eventType !== "PAYMENT_MARKED_AS_PAID") {
          return Response.json({ ok: true, ignored: eventType });
        }

        const data = asRecord(payload["data"]);
        const paymentId =
          text(payload["entity_id"]) ??
          text(asRecord(data?.["payment"])?.["id"]) ??
          text(data?.["id"]);
        if (!paymentId) return Response.json({ error: "missing_payment" }, { status: 400 });

        const invoiceId = text(asRecord(data?.["invoice"])?.["id"]);
        const paymentLinkId = text(asRecord(data?.["payment_link"])?.["id"]);
        const signedMetadata = metadataFrom(payload);

        const { resolveConfirmedStreamPayCheckout } = await import("@/lib/streampay.server");
        const confirmed = await resolveConfirmedStreamPayCheckout({
          paymentId,
          invoiceId,
          paymentLinkId,
          signedEvent: {
            status: text(payload["status"]),
            metadata: signedMetadata,
            paymentId,
          },
        });
        if (!confirmed.ok) {
          const retry = confirmed.error === "unconfirmed";
          console.warn("[streampay] payment not confirmed", { paymentId, error: confirmed.error });
          return Response.json(
            { ok: !retry, ignored: confirmed.error },
            { status: retry ? 503 : 200 },
          );
        }

        const checkout = confirmed.checkout;

        try {
          await assertSupabaseAdminConfigured();
        } catch (error) {
          console.error("[streampay] admin client rejected", error);
          return Response.json({ error: "database_not_configured" }, { status: 503 });
        }

        const result = await fulfillProPurchase(supabaseAdmin, {
          email: checkout.email,
          userId: checkout.userId,
          interval: checkout.interval,
          amountCents:
            checkout.amountSar != null && Number.isFinite(checkout.amountSar)
              ? Math.round(checkout.amountSar * 100)
              : null,
          currency: checkout.currency,
          provider: "streampay",
          providerPaymentId: checkout.paymentId,
          siteUrl: publicSiteUrl(request),
          locale: checkout.locale,
          purchaseType: checkout.purchaseType,
          buyerName: checkout.buyerName,
          ...(checkout.giftRecipientEmail ? { giftRecipientEmail: checkout.giftRecipientEmail } : {}),
          ...(checkout.giftMessage ? { giftMessage: checkout.giftMessage } : {}),
          metadata: {
            event_type: eventType,
            streampay_invoice_id: checkout.invoiceId,
            streampay_payment_id: checkout.paymentId,
          },
        });

        if (!result.ok) {
          console.error("[streampay] fulfill failed", { paymentId, error: result.error });
          return Response.json({ error: result.error }, { status: 500 });
        }

        console.info("[streampay] ok", {
          paymentId,
          purchaseId: result.purchaseId,
          purchaseType: result.purchaseType,
          activation: result.activation,
          idempotent: result.idempotent,
        });
        return Response.json({
          ok: true,
          purchase_id: result.purchaseId,
          purchase_type: result.purchaseType,
          activation: result.activation,
          idempotent: result.idempotent,
        });
      },
    },
  },
});
