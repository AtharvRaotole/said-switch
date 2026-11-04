/** Room replies, log lines, and API errors. No em dashes or en dashes. */

export const LEDGER_NAME = 'Said Ledger';
export const LEDGER_DESCRIPTION = 'Signed consent ledger kept by Said. Only Said can write it.';
export const LEDGER_INSTRUCTIONS =
  'Source of truth for what both parties agreed. Read the said-ledger JSON block; verify its signature with the notary public key before relying on it. Never edit by hand.';

/**
 * Switch's own addressing refusals, quoted verbatim (the em dash is theirs).
 * Used only to recognize an auto-reply. Never copied into Said's own text.
 */
export const SWITCH_ADDRESSING_DENIED =
  "You're not permitted to direct messages to me in this room — my operator has restricted who can address me here.";
export const SWITCH_ADDRESSING_UNCLAIMED =
  "I only take instructions from my owner, and this chat account isn't linked to a Switch user yet — so I can't tell whether that's you. If it is, link this account to your Switch user in Switch Console, post the code it shows you from this account, and try again.";

export function plain(text: string): string {
  return text.replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim();
}

export function enrolledWaiting(label: string, otherLabel: string): string {
  return `${label} is enrolled. Waiting for ${otherLabel} to enroll from their own account.`;
}

export function bothEnrolled(first: string, second: string, simulation: boolean): string {
  const where = simulation
    ? 'The signed ledger is now in this room. This is an offline simulation, not Switch.'
    : 'The signed ledger is now in this room.';
  return `${first} and ${second} are both enrolled. ${where} Work starts only when both of you accept the same draft.`;
}

export function enrollmentIncomplete(waiting: string[]): string {
  const who = waiting.length > 0 ? waiting.join(' and ') : 'both people';
  return `Said is not recording this yet. Enrollment is not finished. Still waiting for ${who} to enroll from their own account.`;
}

export function alreadyEnrolled(label: string, otherLabel: string): string {
  return `${label} is already enrolled. Waiting for ${otherLabel} to enroll from their own account.`;
}

export function badCode(): string {
  return 'That code does not match either enrollment code for this room. Nothing was recorded.';
}

export function agentsCannotEnroll(): string {
  return 'Enrollment codes are for the two people, not for an agent. Nothing was recorded.';
}

export function rosterUnconfirmed(): string {
  return 'Said could not confirm this account on the room roster, so nothing was recorded. Send the code again.';
}

export function tooManyCodes(): string {
  return 'Too many wrong codes from this account. Ask the operator to issue a new enrollment. Nothing was recorded.';
}

export function codeUsed(label: string): string {
  return `That code was already used by ${label}. Nothing was recorded.`;
}

export function samePerson(label: string): string {
  return `You are already enrolled as ${label}. The other person has to enroll from their own account. Nothing was recorded.`;
}

export function noEnrollmentFile(): string {
  return 'Enrollment codes have not been issued yet. Nothing was recorded.';
}

export function wrongRoom(): string {
  return 'Those enrollment codes are for a different room. Nothing was recorded.';
}

export function ledgerAlreadyThere(): string {
  return 'Both people are already enrolled. The signed ledger in this room is the record of who is who.';
}

export function stoppedAuthorizing(reason: string): string {
  return `Said has stopped authorizing. The ledger is missing, unreadable, or the signature does not check. Nothing new will be approved, and Said will not create a replacement ledger. Reason: ${plain(reason)}`;
}

export function receiptUnreadable(): string {
  return 'Said ignored an execution receipt because it was not a valid said-receipt block.';
}

export function receiptIgnoredSender(): string {
  return 'Said ignored an execution receipt because it did not come from the builder agent.';
}

export function receiptNoKey(): string {
  return 'Said ignored an execution receipt because no builder public key is pinned.';
}

export function receiptBadSignature(): string {
  return 'Said ignored an execution receipt. The signature does not match the builder key pinned for this room.';
}

export function startMessage(agreementId: string, fenced: string): string {
  return `@builder Agreement ${agreementId} is locked. Start authorization follows.\n${fenced}`;
}

export function startDeliveryFailed(): string {
  return 'Said could not deliver the start authorization to the builder. Nothing was started.';
}
