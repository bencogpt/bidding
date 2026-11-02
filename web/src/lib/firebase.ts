import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

// Real Firebase web config for project `biding-system`. The web apiKey is not a secret
// (it ships to browsers); access is governed by Firestore/Storage Security Rules.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY ?? 'AIzaSyAIL6Hv9ql1_eUt-4JS9Nm69XJ-IQ56CVI',
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN ?? 'biding-system.firebaseapp.com',
  projectId: import.meta.env.VITE_FB_PROJECT_ID ?? 'biding-system',
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET ?? 'biding-system.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID ?? '45053660863',
  appId: import.meta.env.VITE_FB_APP_ID ?? '1:45053660863:web:f829e4b858c4d8d6a6400a',
};

export const app = initializeApp(firebaseConfig);

const useEmulator =
  import.meta.env.VITE_USE_EMULATOR !== 'false' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

// ---- Firebase App Check (phase 1 of 5) ----
// Proves to Google that requests come from THIS web app, not from a script holding a valid login.
// It must start before Auth/Firestore/Functions/Storage make any request, so every request
// carries the token. Off until VITE_APPCHECK_SITE_KEY (a public reCAPTCHA Enterprise web key,
// phase 0) is set — then nothing is enforced yet either: enforcement is phase 4.
// Local development / emulator: set VITE_APPCHECK_DEBUG_TOKEN to a debug token registered in the
// Firebase console (App Check → Manage debug tokens); never commit a real one.
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
if (appCheckSiteKey) {
  if (useEmulator || import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APPCHECK_DEBUG_TOKEN ?? true; // true → the SDK prints a token to register
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');
export const storage = getStorage(app);

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
