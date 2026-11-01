import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) {
  initializeApp({
    storageBucket: process.env.STORAGE_BUCKET ?? 'biding-system.firebasestorage.app',
  });
}

export const db = getFirestore();
export const auth = getAuth();
export const storage = getStorage();
export const now = () => Date.now();
