/**
 * Local payment fixture. Does not call StreamPay, Supabase, or SMTP.
 * node --experimental-strip-types --import ./scripts/command-match-loader.mjs ./scripts/pro-plan-payment-fixture.mjs
 */
import assert from "node:assert/strict";

delete process.env.SMTP_PASSWORD;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.STREAMPAY_API_KEY;
delete process.env.STREAMPAY_SECRET_KEY;

const { PRO_BILLING_OPTIONS, buildProCheckoutPayload, catalogChargeMatches } = await import("../src/lib/plans.ts");
const { addUtcCalendarMonths } = await import("../src/lib/proPurchase.ts");
const { streamPayOneTimeCharge, evaluateStreamPaySettlement } = await import("../src/lib/streampay.server.ts");
const { fulfillProPurchase } = await import("../src/lib/proPurchase.server.ts");

const EXPECTED = [
  { interval: "monthly", amount: 29, months: 1 },
  { interval: "six_months", amount: 169, months: 6 },
  { interval: "yearly", amount: 279, months: 14 },
];

function createMemoryAdmin() {
  const tables = {
    pro_purchases: [],
    user_subscriptions: [],
    activation_codes: [],
    users: [],
  };
  let seq = 1;

  function matches(row, filters) {
    return filters.every((filter) => {
      const value = row[filter.column] ?? null;
      return filter.op === "eq" ? value === filter.value : value === filter.value;
    });
  }

  function from(table) {
    const filters = [];
    const state = { op: "select", patch: null, row: null, conflict: null };
    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        filters.push({ op: "eq", column, value });
        return api;
      },
      is(column, value) {
        filters.push({ op: "is", column, value });
        return api;
      },
      update(patch) {
        state.op = "update";
        state.patch = patch;
        return api;
      },
      insert(row) {
        state.op = "insert";
        state.row = row;
        return api;
      },
      upsert(row, options) {
        state.op = "upsert";
        state.row = row;
        state.conflict = options?.onConflict ?? null;
        return api;
      },
      maybeSingle() {
        return run();
      },
      single() {
        return run();
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
    };

    async function run() {
      const rows = tables[table];
      if (!rows) return { data: null, error: { message: `unknown table ${table}` } };
      if (state.op === "insert") {
        if (
          table === "pro_purchases" &&
          rows.some(
            (row) =>
              row.provider === state.row.provider &&
              row.provider_payment_id === state.row.provider_payment_id,
          )
        ) {
          return {
            data: null,
            error: { message: "duplicate key value violates unique constraint pro_purchases_provider_payment_unique" },
          };
        }
        const stored = { id: `row-${seq++}`, ...state.row };
        rows.push(stored);
        return { data: stored, error: null };
      }
      if (state.op === "upsert") {
        const key = state.conflict;
        const index = key ? rows.findIndex((row) => row[key] === state.row[key]) : -1;
        if (index >= 0) {
          rows[index] = { ...rows[index], ...state.row };
          return { data: rows[index], error: null };
        }
        const stored = { id: `row-${seq++}`, ...state.row };
        rows.push(stored);
        return { data: stored, error: null };
      }
      const hits = rows.filter((row) => matches(row, filters));
      if (state.op === "update") {
        for (const row of hits) Object.assign(row, state.patch);
        return { data: hits[0] ?? null, error: null };
      }
      return { data: hits[0] ?? null, error: null };
    }

    return api;
  }

  return { from, tables };
}

function assertCalendarMonths(startedMs, endedMs, expiresAt, months) {
  const expiry = Date.parse(expiresAt);
  assert.equal(Number.isNaN(expiry), false);
  const earliest = addUtcCalendarMonths(new Date(startedMs), months).getTime();
  const latest = addUtcCalendarMonths(new Date(endedMs), months).getTime();
  assert.ok(
    expiry >= earliest && expiry <= latest,
    `expected ${months} calendar months, got ${expiresAt}`,
  );
  const sample = new Date(expiry);
  const start = new Date(startedMs);
  const monthDelta =
    (sample.getUTCFullYear() - start.getUTCFullYear()) * 12 + (sample.getUTCMonth() - start.getUTCMonth());
  assert.equal(monthDelta, months);
}

const jan31 = new Date(Date.UTC(2026, 0, 31, 15, 4, 5));
assert.equal(addUtcCalendarMonths(jan31, 1).toISOString(), "2026-02-28T15:04:05.000Z");
assert.equal(addUtcCalendarMonths(new Date(Date.UTC(2024, 0, 31)), 1).toISOString(), "2024-02-29T00:00:00.000Z");
assert.equal(addUtcCalendarMonths(new Date(Date.UTC(2026, 9, 14)), 6).toISOString(), "2027-04-14T00:00:00.000Z");
assert.equal(addUtcCalendarMonths(new Date(Date.UTC(2026, 9, 14)), 14).toISOString(), "2027-12-14T00:00:00.000Z");

const admin = createMemoryAdmin();
const legacyExpiry = "2030-01-01T00:00:00.000Z";
admin.tables.user_subscriptions.push({
  id: "legacy",
  user_id: "legacy-user",
  subscription_status: "active",
  expires_at: legacyExpiry,
  is_lifetime: false,
  active_code: "kept",
});

for (const plan of EXPECTED) {
  assert.equal(PRO_BILLING_OPTIONS[plan.interval].amount, plan.amount);
  assert.equal(PRO_BILLING_OPTIONS[plan.interval].months, plan.months);
  assert.equal(PRO_BILLING_OPTIONS.yearly.freeMonths, 2);
  assert.equal(PRO_BILLING_OPTIONS.monthly.freeMonths, 0);
  assert.equal(PRO_BILLING_OPTIONS.six_months.freeMonths, 0);

  const payload = buildProCheckoutPayload(plan.interval, {
    purchaseType: "direct",
    userId: `user-${plan.interval}`,
    buyerEmail: `${plan.interval}@example.com`,
  });
  const charge = streamPayOneTimeCharge(plan.interval);
  assert.equal(payload.amount, plan.amount);
  assert.equal(payload.months, plan.months);
  assert.equal(payload.billingMode, "one_time");
  assert.equal(charge.invoiceItem.unit_price, plan.amount);
  assert.equal(charge.invoiceItem.price, plan.amount);
  assert.equal(charge.invoiceItem.amount, plan.amount);
  assert.equal(charge.oneTimeProduct.type, "ONE_OFF");
  assert.equal(charge.oneTimeProduct.is_one_time, true);
  assert.equal(charge.oneTimeProduct.price, plan.amount);
  assert.equal(charge.maxNumberOfPayments, 1);
  assert.equal(charge.payload.amount, plan.amount);

  const started = Date.now();
  const first = await fulfillProPurchase(admin, {
    email: `${plan.interval}@example.com`,
    userId: `user-${plan.interval}`,
    interval: plan.interval,
    amountCents: plan.amount * 100,
    currency: "SAR",
    provider: "streampay",
    providerPaymentId: `pay-${plan.interval}`,
    siteUrl: "https://example.test",
    locale: "ar",
    purchaseType: "direct",
  });
  const ended = Date.now();
  assert.equal(first.ok, true, first.ok ? "" : first.error);
  assert.equal(first.idempotent, false);
  assert.equal(first.activation, "direct");

  const purchase = admin.tables.pro_purchases.find((row) => row.provider_payment_id === `pay-${plan.interval}`);
  const subscription = admin.tables.user_subscriptions.find((row) => row.user_id === `user-${plan.interval}`);
  assert.ok(purchase);
  assert.ok(subscription);
  assert.equal(purchase.amount_cents, plan.amount * 100);
  assert.equal(purchase.currency, "SAR");
  assert.equal(purchase.billing_interval, plan.interval);
  assert.equal(purchase.metadata?.entitlement_applied, true);
  assertCalendarMonths(started, ended, subscription.expires_at, plan.months);
  assert.equal(first.expiresAt, subscription.expires_at);

  const again = await fulfillProPurchase(admin, {
    email: `${plan.interval}@example.com`,
    userId: `user-${plan.interval}`,
    interval: plan.interval,
    amountCents: plan.amount * 100,
    currency: "SAR",
    provider: "streampay",
    providerPaymentId: `pay-${plan.interval}`,
    siteUrl: "https://example.test",
    locale: "ar",
    purchaseType: "direct",
  });
  assert.equal(again.ok, true, again.ok ? "" : again.error);
  assert.equal(again.idempotent, true);
  assert.equal(again.expiresAt, subscription.expires_at);
  assert.equal(
    admin.tables.pro_purchases.filter((row) => row.provider_payment_id === `pay-${plan.interval}`).length,
    1,
  );
  assert.equal(
    admin.tables.user_subscriptions.find((row) => row.user_id === `user-${plan.interval}`).expires_at,
    subscription.expires_at,
  );
}

const legacy = admin.tables.user_subscriptions.find((row) => row.user_id === "legacy-user");
assert.equal(legacy.expires_at, legacyExpiry);
assert.equal(legacy.active_code, "kept");
assert.equal(legacy.subscription_status, "active");

admin.tables.pro_purchases.push({
  id: "old-launch",
  provider: "streampay",
  provider_payment_id: "pay-launch-20",
  amount_cents: 2000,
  billing_interval: "monthly",
  user_id: "legacy-user",
  status: "paid",
});

assert.equal(addUtcCalendarMonths(new Date("2027-01-31T23:30:00.000Z"), 1).toISOString(), "2027-02-28T23:30:00.000Z");
assert.equal(addUtcCalendarMonths(new Date("2028-01-31T00:00:00.000Z"), 1).toISOString(), "2028-02-29T00:00:00.000Z");
assert.equal(addUtcCalendarMonths(new Date("2028-02-29T12:00:00.000Z"), 12).toISOString(), "2029-02-28T12:00:00.000Z");
assert.equal(addUtcCalendarMonths(new Date("2028-02-29T12:00:00.000Z"), 14).toISOString(), "2029-04-29T12:00:00.000Z");

const clockAdmin = createMemoryAdmin();
const endOfJanuary = new Date("2027-01-31T23:30:00.000Z");
const endOfMonth = await fulfillProPurchase(clockAdmin, {
  email: "jan@example.com",
  userId: "user-jan",
  interval: "monthly",
  amountCents: 2900,
  currency: "SAR",
  provider: "streampay",
  providerPaymentId: "pay-jan",
  siteUrl: "https://example.test",
  purchaseType: "direct",
  now: endOfJanuary,
});
assert.equal(endOfMonth.ok, true);
assert.equal(clockAdmin.tables.user_subscriptions.find((row) => row.user_id === "user-jan").expires_at, "2027-02-28T23:30:00.000Z");

const leapNow = new Date("2028-02-29T12:00:00.000Z");
const leap = await fulfillProPurchase(clockAdmin, {
  email: "leap@example.com",
  userId: "user-leap",
  interval: "yearly",
  amountCents: 27900,
  currency: "SAR",
  provider: "streampay",
  providerPaymentId: "pay-leap",
  siteUrl: "https://example.test",
  purchaseType: "direct",
  now: leapNow,
  durationDays: 30,
});
assert.equal(leap.ok, true);
assert.equal(clockAdmin.tables.user_subscriptions.find((row) => row.user_id === "user-leap").expires_at, "2029-04-29T12:00:00.000Z");

clockAdmin.tables.user_subscriptions.push({
  id: "active-row",
  user_id: "user-extend",
  subscription_status: "active",
  expires_at: "2028-11-30T08:00:00.000Z",
  is_lifetime: false,
  active_code: "previous",
});
const extended = await fulfillProPurchase(clockAdmin, {
  email: "extend@example.com",
  userId: "user-extend",
  interval: "six_months",
  amountCents: 16900,
  currency: "SAR",
  provider: "streampay",
  providerPaymentId: "pay-extend",
  siteUrl: "https://example.test",
  purchaseType: "direct",
  now: new Date("2028-03-01T08:00:00.000Z"),
  amount: 1,
  durationDays: 1,
});
assert.equal(extended.ok, true);
assert.equal(
  clockAdmin.tables.user_subscriptions.find((row) => row.user_id === "user-extend").expires_at,
  "2029-05-30T08:00:00.000Z",
);

const mismatch = await fulfillProPurchase(clockAdmin, {
  email: "bad@example.com",
  userId: "user-bad",
  interval: "yearly",
  amountCents: 100,
  currency: "SAR",
  provider: "streampay",
  providerPaymentId: "pay-bad-amount",
  siteUrl: "https://example.test",
  purchaseType: "direct",
  now: endOfJanuary,
});
assert.equal(mismatch.ok, false);
assert.equal(mismatch.error, "amount_mismatch");
assert.equal(clockAdmin.tables.user_subscriptions.some((row) => row.user_id === "user-bad"), false);
assert.equal(clockAdmin.tables.pro_purchases.some((row) => row.provider_payment_id === "pay-bad-amount"), false);

const wrongCurrency = await fulfillProPurchase(clockAdmin, {
  email: "usd@example.com",
  userId: "user-usd",
  interval: "monthly",
  amountCents: 2900,
  currency: "USD",
  provider: "streampay",
  providerPaymentId: "pay-usd",
  siteUrl: "https://example.test",
  purchaseType: "direct",
});
assert.equal(wrongCurrency.ok, false);
assert.equal(wrongCurrency.error, "amount_mismatch");

function settlement(overrides) {
  return evaluateStreamPaySettlement({
    interval: "yearly",
    paymentId: "pay_ok",
    userId: "user-1",
    purchaseType: "direct",
    amountsSar: [279],
    currencies: ["SAR"],
    statuses: ["SUCCEEDED"],
    signedStatus: "SUCCEEDED",
    ...overrides,
  });
}

assert.equal(settlement({}).ok, true);
assert.equal(settlement({ amountsSar: [1], currencies: ["SAR"] }).error, "amount_mismatch");
assert.equal(settlement({ currencies: ["USD"] }).error, "amount_mismatch");
assert.equal(settlement({ paymentId: null }).error, "missing_metadata");
assert.equal(settlement({ userId: null }).error, "missing_metadata");
for (const status of ["FAILED", "CANCELLED", "CANCELED", "EXPIRED"]) {
  const result = settlement({ statuses: [status], signedStatus: status });
  assert.equal(result.ok, false);
  assert.equal(result.error, "not_paid");
}
assert.equal(settlement({ statuses: [], signedStatus: "PENDING" }).error, "unconfirmed");
assert.equal(catalogChargeMatches("monthly", 29, "SAR"), true);
assert.equal(catalogChargeMatches("monthly", 20, "SAR"), false);

const raceAdmin = createMemoryAdmin();
const raceNow = new Date("2026-10-14T12:00:00.000Z");
const [firstRace, secondRace] = await Promise.all([
  fulfillProPurchase(raceAdmin, {
    email: "race@example.com",
    userId: "user-race",
    interval: "monthly",
    amountCents: 2900,
    currency: "SAR",
    provider: "streampay",
    providerPaymentId: "pay-race",
    siteUrl: "https://example.test",
    purchaseType: "direct",
    now: raceNow,
  }),
  fulfillProPurchase(raceAdmin, {
    email: "race@example.com",
    userId: "user-race",
    interval: "monthly",
    amountCents: 2900,
    currency: "SAR",
    provider: "streampay",
    providerPaymentId: "pay-race",
    siteUrl: "https://example.test",
    purchaseType: "direct",
    now: raceNow,
  }),
]);
assert.equal(firstRace.ok && secondRace.ok, true);
assert.equal(
  raceAdmin.tables.pro_purchases.filter((row) => row.provider_payment_id === "pay-race").length,
  1,
);
assert.equal(
  raceAdmin.tables.user_subscriptions.find((row) => row.user_id === "user-race").expires_at,
  addUtcCalendarMonths(raceNow, 1).toISOString(),
);

const untouched = admin.tables.pro_purchases.find((row) => row.provider_payment_id === "pay-launch-20");
assert.equal(untouched.amount_cents, 2000);
assert.equal(untouched.user_id, "legacy-user");
assert.equal(admin.tables.user_subscriptions.find((row) => row.user_id === "legacy-user").expires_at, legacyExpiry);

for (const plan of EXPECTED) {
  const charge = streamPayOneTimeCharge(plan.interval);
  assert.equal(charge.invoiceItem.quantity, 1);
  assert.equal(charge.invoiceItem.currency, "SAR");
  assert.deepEqual(
    [charge.invoiceItem.unit_price, charge.invoiceItem.price, charge.invoiceItem.amount],
    [plan.amount, plan.amount, plan.amount],
  );
  assert.equal(charge.oneTimeProduct.type, "ONE_OFF");
  assert.equal(charge.maxNumberOfPayments, 1);
}

console.log("pro plan payment fixture ok");
