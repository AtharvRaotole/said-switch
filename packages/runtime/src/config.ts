import { z } from 'zod';
import { readJson, writeJson } from './files';
import { paths } from './paths';

const agentRef = z.object({
  agentId: z.string().min(1),
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
});

export const saidConfigSchema = z.object({
  /** `live` talks to a real Switch server; `offline` talks to apps/mock-switch and is labeled as a simulation everywhere. */
  mode: z.enum(['live', 'offline']),
  switchUrl: z.string().url(),
  deploymentId: z.string().min(1),
  roomId: z.string().min(1),
  roomName: z.string().nullable().default(null),
  roomMode: z.enum(['business', 'personal']),
  said: agentRef,
  builder: agentRef.nullable(),
  worker: z.enum(['claude', 'codex', 'scripted']),
});
export type SaidConfig = z.infer<typeof saidConfigSchema>;

export const secretsSchema = z.object({
  saidApiKey: z.string().min(1),
  builderApiKey: z.string().min(1).nullable(),
});
export type Secrets = z.infer<typeof secretsSchema>;

const publicKey = z.object({ keyId: z.string().min(1), publicKey: z.string().min(1) });
export const publicKeysSchema = z.object({ notary: publicKey, builder: publicKey.nullable() });
export type PublicKeys = z.infer<typeof publicKeysSchema>;

export const enrollmentSchema = z.object({
  roomId: z.string().min(1),
  createdAt: z.number(),
  codes: z.array(
    z.object({
      role: z.enum(['developer', 'client', 'partnerA', 'partnerB']),
      label: z.string().min(1),
      code: z.string().regex(/^[A-Z0-9]{4,8}$/),
    }),
  ).length(2),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;

export class ConfigMissingError extends Error {
  constructor(what: string, hint: string) {
    super(`${what} not found. ${hint}`);
    this.name = 'ConfigMissingError';
  }
}

async function load<T>(path: string, schema: z.ZodType<T>, what: string, hint: string): Promise<T> {
  const raw = await readJson<unknown>(path);
  if (raw === null) throw new ConfigMissingError(what, hint);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${what} at ${path} is invalid: ${parsed.error.message}`);
  return parsed.data;
}

export const loadConfig = () =>
  load(paths.config, saidConfigSchema, 'Said config', 'Run `npm run register` (live) or `npm run demo:offline`.');
export const loadSecrets = () =>
  load(paths.secrets, secretsSchema, 'Agent API keys', 'Run `npm run register`.');
export const loadPublicKeys = () =>
  load(paths.publicKeys, publicKeysSchema, 'Pinned public keys', 'Run `npm run setup`.');
export const loadEnrollment = async (): Promise<Enrollment | null> => {
  const raw = await readJson<unknown>(paths.enrollment);
  return raw === null ? null : enrollmentSchema.parse(raw);
};

export const saveConfig = (c: SaidConfig) => writeJson(paths.config, saidConfigSchema.parse(c));
export const saveSecrets = (s: Secrets) => writeJson(paths.secrets, secretsSchema.parse(s), { secret: true });
export const savePublicKeys = (p: PublicKeys) => writeJson(paths.publicKeys, publicKeysSchema.parse(p));
export const saveEnrollment = (e: Enrollment) => writeJson(paths.enrollment, enrollmentSchema.parse(e));
