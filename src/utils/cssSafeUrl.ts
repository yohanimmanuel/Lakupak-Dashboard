/**
 * Builds a safe CSS `url("…")` from an untrusted URL for `background` / `backgroundImage`.
 * Uses encodeURI plus escaping for `\`, `"`, and newlines inside a quoted CSS string so values
 * cannot break out of `url()` or the surrounding declaration.
 */
export function cssSafeUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  let encoded: string;
  try {
    encoded = encodeURI(t);
  } catch {
    return null;
  }
  const escaped = encoded
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\n|\r/g, '\\A ');
  return `url("${escaped}")`;
}
