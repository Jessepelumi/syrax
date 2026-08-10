const BIDI_CONTROL_CHARACTERS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
const REPEATED_WHITESPACE = /\s+/g;

export function normalizeDisplayText(value: string, maximumLength: number): string {
  if (!Number.isSafeInteger(maximumLength) || maximumLength <= 0) {
    throw new RangeError("maximumLength must be a positive safe integer");
  }

  return Array.from(
    value
      .normalize("NFKC")
      .replace(BIDI_CONTROL_CHARACTERS, "")
      .replace(CONTROL_CHARACTERS, "")
      .replace(REPEATED_WHITESPACE, " ")
      .trim(),
  )
    .slice(0, maximumLength)
    .join("");
}
