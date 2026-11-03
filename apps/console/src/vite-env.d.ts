/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOTARY_URL?: string;
  readonly VITE_BUILDER_URL?: string;
  /** Optional base64 Ed25519 key pinned at build time; overrides the key the notary reports. */
  readonly VITE_NOTARY_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
