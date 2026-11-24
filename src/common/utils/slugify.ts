const MAX_SLUG_LENGTH = 90;

/** URL-safe lower-case slug: "AC Gas Refill & Repair" → "ac-gas-refill-and-repair". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/** Picks `base`, else `base-2`, `base-3`, … until `isTaken` says it is free. */
export async function uniqueSlug(
  value: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(value) || 'item';
  let candidate = base;
  for (let suffix = 2; await isTaken(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
