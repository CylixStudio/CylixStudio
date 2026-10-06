/**
 * Test and preview alerts stay on screen, but they are not real stream events.
 * Writers trust only `isTest` set by the test buttons. Readers also honor the
 * JSON already stored on older rows (`isTest`, `type: "test"`, `test_harness`,
 * `simulated`) so those rows stop inflating totals.
 */

type TestFlagSource = {
  isTest?: boolean;
  eventType?: string | null;
  event_type?: string | null;
  type?: string | null;
  rawPayload?: unknown;
  raw_payload?: unknown;
};

function payloadRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function typeIsTest(value: unknown): boolean {
  return value === "test";
}

/** True only when this process marked the event at the test-dispatch site. */
export function isDispatchedTest(event: { isTest?: boolean }): boolean {
  return event.isTest === true;
}

/** True when a stored row, or its JSON payload, is a test or preview alert. */
export function isStoredTestRow(source: TestFlagSource): boolean {
  if (source.isTest === true) return true;
  if (typeIsTest(source.eventType) || typeIsTest(source.event_type) || typeIsTest(source.type)) {
    return true;
  }
  const record = payloadRecord(source.rawPayload ?? source.raw_payload);
  if (!record) return false;
  if (record["isTest"] === true) return true;
  if (
    typeIsTest(record["type"]) ||
    typeIsTest(record["eventType"]) ||
    typeIsTest(record["event_type"])
  ) {
    return true;
  }
  return record["test_harness"] === true || record["simulated"] === true;
}

export type TestDisplay = {
  amount: number | null;
  currency: string | null;
  quantity: number;
};

/** On-screen amount for a test row. Numeric columns stay empty. */
export function readTestDisplay(raw: unknown): TestDisplay | null {
  if (!isStoredTestRow({ rawPayload: raw })) return null;
  const record = payloadRecord(raw);
  if (!record) return { amount: null, currency: null, quantity: 1 };
  const amountValue = record["displayAmount"];
  const quantityValue = record["displayQuantity"];
  const currency = record["displayCurrency"];
  return {
    amount: typeof amountValue === "number" && Number.isFinite(amountValue) ? amountValue : null,
    currency: typeof currency === "string" && currency.trim() ? currency : null,
    quantity:
      typeof quantityValue === "number" && Number.isFinite(quantityValue) && quantityValue > 0
        ? quantityValue
        : 1,
  };
}

/** Fields merged into `raw_payload` so the alert can render without a stored total. */
export function testStorageFields(event: {
  isTest?: boolean;
  amount: number | null;
  currency: string | null;
  quantity: number;
}): Record<string, unknown> | null {
  if (!isDispatchedTest(event)) return null;
  const quantity = Math.max(1, Math.round(Number(event.quantity) || 1));
  return {
    isTest: true,
    ...(event.amount != null && Number.isFinite(event.amount) ? { displayAmount: event.amount } : {}),
    ...(event.currency ? { displayCurrency: event.currency } : {}),
    displayQuantity: quantity,
  };
}
