import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBzqP5WEBkks9i-uegtYpQLbi-FRLqNh9A",
  authDomain: "gym-progress-tracker-27fab.firebaseapp.com",
  projectId: "gym-progress-tracker-27fab",
  storageBucket: "gym-progress-tracker-27fab.firebasestorage.app",
  messagingSenderId: "563732535177",
  appId: "1:563732535177:web:b1f96f6c1d31b4ed917358",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app, "default");
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
