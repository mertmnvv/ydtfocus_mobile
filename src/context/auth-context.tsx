import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { onSnapshot, doc } from 'firebase/firestore';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { auth, db } from '@/lib/firebase';
import { ensureUserProfile, incrementStudyMinutes, type UserProfile } from '@/lib/firestore';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

type AuthContextValue = {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (firebaseUser) {
        setUser(firebaseUser);
        await ensureUserProfile(firebaseUser.uid, {
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });

        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          if (snap.exists()) setUserProfile(snap.data() as UserProfile);
          setLoading(false);
        });
      } else {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile?.();
    };
  }, []);

  // Aktif çalışma süresi takibi — web'deki AuthContext'in aynı davranışı
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      incrementStudyMinutes(user.uid, 1).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function register(email: string, password: string, displayName: string) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
  }

  async function loginWithGoogle() {
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (!response.data?.idToken) throw new Error('Google girişinden idToken alınamadı');
    const credential = GoogleAuthProvider.credential(response.data.idToken);
    await signInWithCredential(auth, credential);
  }

  async function logout() {
    await GoogleSignin.signOut().catch(() => {});
    await signOut(auth);
  }

  // Web'de premiumUntil süresi dolunca role'ü otomatik "free"ye düşüren
  // bir mekanizma yok (PayTR webhook'u sadece rol atarken çalışıyor) —
  // burada en azından UI'da doğru göstermek için süre kontrolü ekleniyor.
  const premiumActive =
    userProfile?.role === 'premium' &&
    (!userProfile.premiumUntil || userProfile.premiumUntil > Date.now());
  const isPremium = premiumActive || userProfile?.role === 'admin';
  const isAdmin = userProfile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{ user, userProfile, loading, isPremium, isAdmin, login, register, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
