/**
 * Live Switch (0.31) posts Matrix-style actor ids on message events
 * (e.g. `@switch-mattermost-…-user:localhost`) while `connect_to_room` /
 * `list_participants` list UUID participant ids. Bridged humans and agents
 * still share a stable `name` (Mattermost username / agent name), so Said
 * matches on id first and falls back to a case-insensitive name match.
 */
export function actorMatches(opts: {
  senderId: string;
  senderName?: string | null;
  id?: string | null;
  name?: string | null;
}): boolean {
  if (opts.id && opts.senderId === opts.id) return true;
  const senderName = opts.senderName?.trim().toLowerCase();
  const name = opts.name?.trim().toLowerCase();
  return Boolean(senderName && name && senderName === name);
}
