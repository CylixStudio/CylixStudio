/**
 * Exact chat-command check.
 * After outer trim, the message must equal the full trigger. Extra words,
 * a longer word, and trailing punctuation do not match.
 * ASCII Latin is case-insensitive. Arabic and every other code point stay unchanged.
 * Commands with a real parameter list do not use this for their argument tail.
 */

const INVISIBLE =
  /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u061C]/g;

/** Outer trim only. Internal spaces stay part of a multi-word name. */
function prepare(raw: string): string[] {
  return [...raw.normalize("NFC").replace(INVISIBLE, "").trim()];
}

function sameTriggerChar(left: string, right: string): boolean {
  if (left === right) return true;
  const a = left.codePointAt(0);
  const b = right.codePointAt(0);
  if (a === undefined || b === undefined) return false;
  const aAsciiLetter = (a >= 0x41 && a <= 0x5a) || (a >= 0x61 && a <= 0x7a);
  const bAsciiLetter = (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
  if (!aAsciiLetter || !bAsciiLetter) return false;
  return (a | 32) === (b | 32);
}

export function messageStartsWithTrigger(message: string, trigger: string): boolean {
  const text = prepare(message);
  const needle = prepare(trigger);
  if (text.length === 0 || needle.length === 0 || text.length !== needle.length) return false;

  for (let i = 0; i < needle.length; i++) {
    const left = text[i];
    const right = needle[i];
    if (left === undefined || right === undefined || !sameTriggerChar(left, right)) return false;
  }
  return true;
}
