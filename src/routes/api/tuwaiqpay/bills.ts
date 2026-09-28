import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/lib/supabase/types";

const BodySchema = z.object({
  interval: z.enum(["monthly", "six_months", "yearly"]),
  purchaseType: z.enum(["direct", "gift"]).default("direct"),
});

async function userFromBearer(request: Request): Promise<{ id: string; email: string | null } | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) return null;

  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !key) return null;

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;
  return { id: data.claims.sub, email };
}

/** Authenticated Pro checkout: creates a TuwaiqPay bill and returns the pay link. */
export const Route = createFileRoute("/api/tuwaiqpay/bills")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await userFromBearer(request);
        if (!user) {
          return Response.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }
        const parsed = BodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
        }

        const {
          buildProBillRequest,
          createTuwaiqBill,
          resolveBuyerContact,
          saveTuwaiqBill,
          tuwaiqConfigured,
        } = await import("@/lib/tuwaiqpay.server");

        if (!tuwaiqConfigured()) {
          return Response.json({ error: "tuwaiqpay_not_configured" }, { status: 503 });
        }

        const { supabaseAdmin } = await import("@/lib/supabase/client.server");
        const contact = await resolveBuyerContact(supabaseAdmin, user.id, user.email);
        if (!contact.email) {
          return Response.json({ error: "missing_email" }, { status: 400 });
        }
        if (!contact.phone) {
          return Response.json({ error: "missing_phone" }, { status: 400 });
        }

        try {
          const bill = await createTuwaiqBill(
            buildProBillRequest({
              interval: parsed.data.interval,
              customerName: contact.name,
              customerMobilePhone: contact.phone,
            }),
          );
          await saveTuwaiqBill(supabaseAdmin, {
            userId: user.id,
            email: contact.email,
            interval: parsed.data.interval,
            purchaseType: parsed.data.purchaseType,
            customerName: contact.name,
            customerMobilePhone: contact.phone,
            bill,
          });

          return Response.json(
            {
              link: bill.link,
              qrCode: bill.qrCode,
              billId: bill.billId,
              amount: bill.amount,
              expireDate: bill.expireDate,
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const code = error instanceof Error ? error.message : "tuwaiqpay_bill_failed";
          const status = code === "tuwaiqpay_not_configured" ? 503 : 502;
          return Response.json({ error: code }, { status });
        }
      },
    },
  },
});
