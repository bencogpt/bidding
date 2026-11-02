/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FB_API_KEY?: string;
  readonly VITE_FB_AUTH_DOMAIN?: string;
  readonly VITE_FB_PROJECT_ID?: string;
  readonly VITE_FB_STORAGE_BUCKET?: string;
  readonly VITE_FB_SENDER_ID?: string;
  readonly VITE_FB_APP_ID?: string;
  readonly VITE_USE_EMULATOR?: string;
  // Firebase App Check: public reCAPTCHA Enterprise web site key; App Check stays off without it.
  readonly VITE_APPCHECK_SITE_KEY?: string;
  // Local development only: a debug token registered in the Firebase console. Never commit it.
  readonly VITE_APPCHECK_DEBUG_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
