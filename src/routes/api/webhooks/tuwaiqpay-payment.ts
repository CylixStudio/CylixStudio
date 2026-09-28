import { createFileRoute } from "@tanstack/react-router";

import type { TuwaiqWebhookPayload } from "@/lib/tuwaiqpay.server";

function expectedSignature(): { header: string; value: string } {
  const header = (process.env["TUWAIQPAY_WEBHOOK_HEADER"]?.trim() || "x-signature").toLowerCase();
  const value = process.env["TUWAIQPAY_WEBHOOK_SIGNATURE"]?.trim() || "Tuwaiqpay";
  return { header, value };
}

/**
 * TuwaiqPay payment notification.
 * POST /api/webhooks/tuwaiqpay-payment
 * Auth: x-signature (default value Tuwaiqpay, or TUWAIQPAY_WEBHOOK_SIGNATURE).
 * Gift purchases generate a code and email it before this handler acknowledges success.
 */
export const Route = createFileRoute("/api/webhooks/tuwaiqpay-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { safeEqual } = await import("@/lib/webhooks/verify.server");
        const expected = expectedSignature();
        const provided = request.headers.get(expected.header) ?? "";
        if (!provided || !safeEqual(provided, expected.value)) {
          console.warn("[tuwaiqpay] rejected webhook signature");
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        let payload: TuwaiqWebhookPayload;
        try {
          payload = (await request.json()) as TuwaiqWebhookPayload;
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const billId = payload.transactionDetails?.bill?.id ?? null;
        const status = payload.transactionDetails?.bill?.status ?? payload.transactionDetails?.transactionStatus ?? null;
        console.info("[tuwaiqpay] webhook accepted", { billId, status });

        try {
          const { publicSiteUrl } = await import("@/lib/siteUrl.server");
          const { supabaseAdmin } = await import("@/lib/supabase/client.server");
          const { applyTuwaiqWebhook } = await import("@/lib/tuwaiqpay.server");
          const result = await applyTuwaiqWebhook(supabaseAdmin, payload, publicSiteUrl(request));
          console.info("[tuwaiqpay] webhook applied", { billId, ...result });

          if (!result.matched || result.pending) {
            return Response.json({ ok: true, matched: result.matched }, { status: 200, headers: { "cache-control": "no-store" } });
          }
          if (!result.fulfilled) {
            console.error("[tuwaiqpay] paid bill was not fulfilled", { billId, status });
            return Response.json({ ok: false, error: "fulfill_failed" }, { status: 503, headers: { "cache-control": "no-store" } });
          }
          if (result.activation === "pending_manual_redeem" && result.emailDelivered === false) {
            console.error("[tuwaiqpay] activation email failed after retries; webhook will be retried", {
              billId,
              error: result.emailError ?? "email_failed",
            });
            return Response.json(
              { ok: false, error: "email_undelivered" },
              { status: 503, headers: { "cache-control": "no-store" } },
            );
          }

          return Response.json({ ok: true }, { status: 200, headers: { "cache-control": "no-store" } });
        } catch (error: unknown) {
          console.error("[tuwaiqpay] webhook apply failed", {
            billId,
            message: error instanceof Error ? error.message : String(error),
          });
          return Response.json({ ok: false, error: "webhook_failed" }, { status: 503, headers: { "cache-control": "no-store" } });
        }
      },
    },
  },
});
