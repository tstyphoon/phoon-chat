/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND?: 'mock' | 'supabase';
  /** Supabase 專案網址（公開） */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase 公開金鑰（Publishable key，sb_publishable_ 開頭，設計上就是公開的） */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
