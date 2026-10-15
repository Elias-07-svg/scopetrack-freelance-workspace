import { getApp, getApps, initializeApp } from '@firebase/app';
import { getAuth, GoogleAuthProvider } from '@firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

export const firebaseReady = Object.values(config).every((value) => typeof value === 'string' && value.trim());
export const auth = firebaseReady ? getAuth(getApps().length ? getApp() : initializeApp(config)) : null;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const emailActionSettings = () => ({
  url: `${window.location.origin}/?verified=1${new URLSearchParams(window.location.search).has('invite') ? `&invite=${encodeURIComponent(new URLSearchParams(window.location.search).get('invite'))}` : ''}`,
});
