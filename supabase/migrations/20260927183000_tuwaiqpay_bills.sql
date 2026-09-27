-- TuwaiqPay bills created for Pro checkout, updated by the payment webhook.

CREATE TABLE IF NOT EXISTS public.tuwaiqpay_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  bill_id bigint NOT NULL,
  transaction_id text,
  merchant_transaction_id text,
  amount numeric(12, 2) NOT NULL,
  currency_id integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'PENDING',
  payment_link text,
  qr_code text,
  description text,
  customer_name text,
  customer_mobile_phone text,
  purchase_type text NOT NULL DEFAULT 'direct',
  billing_interval text NOT NULL,
  buyer_email text,
  gift_recipient_email text,
  gift_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tuwaiqpay_bills_bill_id_unique UNIQUE (bill_id),
  CONSTRAINT tuwaiqpay_bills_status_check CHECK (
    status IN ('PENDING', 'PAID', 'FAILED', 'PENDING_SETTLEMENT', 'EXPIRED', 'REFUNDED')
  ),
  CONSTRAINT tuwaiqpay_bills_interval_check CHECK (
    billing_interval IN ('monthly', 'six_months', 'yearly')
  ),
  CONSTRAINT tuwaiqpay_bills_purchase_type_check CHECK (
    purchase_type IN ('direct', 'gift')
  )
);

CREATE INDEX IF NOT EXISTS tuwaiqpay_bills_user_idx
  ON public.tuwaiqpay_bills (user_id, created_at DESC);

GRANT SELECT ON public.tuwaiqpay_bills TO authenticated;
GRANT ALL ON public.tuwaiqpay_bills TO service_role;

ALTER TABLE public.tuwaiqpay_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tuwaiqpay_bills_read_own ON public.tuwaiqpay_bills;
CREATE POLICY tuwaiqpay_bills_read_own ON public.tuwaiqpay_bills
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS tuwaiqpay_bills_updated_at ON public.tuwaiqpay_bills;
CREATE TRIGGER tuwaiqpay_bills_updated_at
  BEFORE UPDATE ON public.tuwaiqpay_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
