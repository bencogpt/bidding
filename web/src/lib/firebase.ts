import { initializeApp } from 'firebase/app';
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
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');
export const storage = getStorage(app);

const useEmulator =
  import.meta.env.VITE_USE_EMULATOR !== 'false' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
