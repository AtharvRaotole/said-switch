/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOTARY_URL?: string;
  readonly VITE_BUILDER_URL?: string;
  readonly VITE_NOTARY_PUBLIC_KEY?: string;
  /** Optional; appended as ?said_shared_secret= for EventSource and sent as Bearer on fetch. */
  readonly VITE_SAID_HTTP_SHARED_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
