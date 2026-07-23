import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
// eslint-disable-next-line import/no-duplicates -- @ts-expect-error'ı izole etmek için ikinci import kasıtlı ayrı
import { GoogleAuthProvider, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
// getReactNativePersistence sadece firebase/auth'un RN build'inde tipli;
// Metro çalışma zamanında RN sürümünü çözümlüyor ama tsc her zaman browser
// tiplerini görüyor, bu yüzden bu import ayrı tutulup type-check'ten muaf.
// @ts-expect-error - RN build'inde mevcut, browser .d.ts'te tanımlı değil
// eslint-disable-next-line import/no-duplicates -- @ts-expect-error'ı izole etmek için kasıtlı ayrı import
import { getReactNativePersistence } from 'firebase/auth';

// Web'deki ydtfocusv2/src/lib/firebase.js ile AYNI Firebase projesi
// (bkz. PROJECT_STATUS.md). RN'de getAuth() persistence'ı otomatik
// AsyncStorage'a bağlamıyor — initializeAuth + getReactNativePersistence
// açıkça verilmeli, yoksa oturum uygulama kapanınca sıfırlanır.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export default app;
