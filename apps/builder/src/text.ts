/** Hyphens are fine. Em dashes and en dashes are not, in anything a person reads. */
export function plain(text: string): string {
  return text.replaceAll('\u2014', '-').replaceAll('\u2013', '-');
}

export function tail(text: string, max = 2000): string {
  const clean = plain(text).trim();
  if (clean.length <= max) return clean;
  return clean.slice(-max);
}

export function oneLine(text: string): string {
  return plain(text).replace(/\s+/g, ' ').trim();
}
