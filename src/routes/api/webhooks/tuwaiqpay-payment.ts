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
 * Returns 200 as soon as the payload is accepted so TuwaiqPay does not retry.
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

        const { publicSiteUrl } = await import("@/lib/siteUrl.server");
        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const { applyTuwaiqWebhook } = await import("@/lib/tuwaiqpay.server");
        const siteUrl = publicSiteUrl(request);

        const job = applyTuwaiqWebhook(supabaseAdmin, payload, siteUrl).then(
          (result) => {
            console.info("[tuwaiqpay] webhook applied", { billId, ...result });
          },
          (error: unknown) => {
            console.error("[tuwaiqpay] webhook apply failed", {
              billId,
              message: error instanceof Error ? error.message : String(error),
            });
          },
        );
        void job;

        return Response.json({ ok: true }, { status: 200, headers: { "cache-control": "no-store" } });
      },
    },
  },
});
