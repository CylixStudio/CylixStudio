/**
 * Chat command prefix check.
 * A trigger matches only at the start of the message, and only when the next
 * code point ends the token: end of string, whitespace, or punctuation.
 * Letters and numbers (Latin or Arabic) and "_" continue the same word.
 * ASCII Latin is case-insensitive. Other code points, including Arabic, are compared unchanged.
 */

const INVISIBLE =
  /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u061C]/g;

function prepare(raw: string): string[] {
  return [
    ...raw
      .normalize("NFC")
      .replace(INVISIBLE, "")
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  ];
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

function isArabicLetter(cp: number): boolean {
  return (
    (cp >= 0x0621 && cp <= 0x063a) ||
    (cp >= 0x0641 && cp <= 0x064a) ||
    cp === 0x066e ||
    cp === 0x066f ||
    (cp >= 0x0671 && cp <= 0x06d3) ||
    cp === 0x06d5 ||
    (cp >= 0x06ee && cp <= 0x06ef) ||
    (cp >= 0x06fa && cp <= 0x06fc) ||
    cp === 0x06ff ||
    (cp >= 0x0750 && cp <= 0x077f) ||
    (cp >= 0x08a0 && cp <= 0x08c8) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfefc)
  );
}

function isLatinLetter(cp: number): boolean {
  return (
    ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) ||
    (cp >= 0xc0 && cp <= 0xff && cp !== 0xd7 && cp !== 0xf7) ||
    (cp >= 0x100 && cp <= 0x24f) ||
    (cp >= 0x1e00 && cp <= 0x1eff)
  );
}

/** Letter or number in Latin or Arabic, or "_". Those continue the trigger word. */
function isTriggerContinuation(char: string): boolean {
  if (char === "_") return true;
  const cp = char.codePointAt(0);
  if (cp === undefined) return false;
  if (cp >= 0x30 && cp <= 0x39) return true;
  if ((cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9)) return true;
  return isLatinLetter(cp) || isArabicLetter(cp);
}

export function messageStartsWithTrigger(message: string, trigger: string): boolean {
  const text = prepare(message);
  const needle = prepare(trigger);
  if (text.length === 0 || needle.length === 0 || text.length < needle.length) return false;

  for (let i = 0; i < needle.length; i++) {
    const left = text[i];
    const right = needle[i];
    if (left === undefined || right === undefined || !sameTriggerChar(left, right)) return false;
  }

  const next = text[needle.length];
  if (next === undefined) return true;
  return !isTriggerContinuation(next);
}
