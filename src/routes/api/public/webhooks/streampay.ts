import { createFileRoute } from "@tanstack/react-router";

import type { ProBillingInterval, ProPurchaseType } from "@/lib/plans";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataFrom(payload: Record<string, unknown>, payment: Record<string, unknown> | null) {
  return (
    asRecord(payment?.["custom_metadata"]) ??
    asRecord(payment?.["metadata"]) ??
    asRecord(asRecord(payload["data"])?.["metadata"]) ??
    null
  );
}

function intervalOf(value: string | null): ProBillingInterval | null {
  if (value === "monthly" || value === "six_months" || value === "yearly") return value;
  return null;
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
        const { fetchStreamPayPayment, verifyStreamPaySignature } = await import("@/lib/streampay.server");
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

        const paymentId = text(payload["entity_id"]) ?? text(asRecord(payload["data"])?.["id"]);
        if (!paymentId) return Response.json({ error: "missing_payment" }, { status: 400 });

        const payment = await fetchStreamPayPayment(paymentId);
        const status = (text(payment?.["status"]) ?? text(payload["status"]) ?? "").toUpperCase();
        if (status && !["SUCCEEDED", "PAID", "COMPLETED", "MARKED_AS_PAID"].includes(status)) {
          console.warn("[streampay] payment not successful", { paymentId, status });
          return Response.json({ ok: true, ignored: status });
        }

        const metadata = metadataFrom(payload, payment);
        const userId = text(metadata?.["user_id"]);
        const email = text(metadata?.["email"]);
        const interval = intervalOf(text(metadata?.["interval"]));
        const purchaseType: ProPurchaseType =
          text(metadata?.["purchase_type"]) === "gift" ? "gift" : "direct";
        if (!email || !interval || (purchaseType === "direct" && !userId)) {
          console.warn("[streampay] payment missing checkout metadata", { paymentId, eventType });
          return Response.json({ ok: true, ignored: "missing_metadata" });
        }

        try {
          await assertSupabaseAdminConfigured();
        } catch (error) {
          console.error("[streampay] admin client rejected", error);
          return Response.json({ error: "database_not_configured" }, { status: 503 });
        }

        const amount = Number(metadata?.["amount"]);
        const result = await fulfillProPurchase(supabaseAdmin, {
          email,
          userId,
          interval,
          amountCents: Number.isFinite(amount) ? Math.round(amount * 100) : null,
          currency: text(metadata?.["currency"]) ?? "SAR",
          provider: "streampay",
          providerPaymentId: paymentId,
          siteUrl: publicSiteUrl(request),
          locale: text(metadata?.["locale"]) === "en" ? "en" : "ar",
          purchaseType,
          buyerName: text(metadata?.["buyer_name"]),
          metadata: { event_type: eventType, streampay_status: status || null },
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
