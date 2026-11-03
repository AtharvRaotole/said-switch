import type { Party, Role } from '@said/core';

const ROLE_ORDER: readonly Role[] = ['developer', 'client', 'partnerA', 'partnerB'];

/** Parties in slot order: developer | client, or partner A | partner B. */
export function orderedParties(parties: Party[]): Party[] {
  return [...parties].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
}

export function partyLabel(parties: Party[], role: Role | null, fallback: string): string {
  if (!role) return fallback;
  return parties.find((p) => p.role === role)?.label ?? fallback;
}
