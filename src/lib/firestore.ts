import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

// Web'deki ydtfocusv2/src/lib/firestore.js ile AYNI Firestore koleksiyon
// yapısı (users/{uid}/words, users/{uid}/data/stats) — web'deki kullanıcı
// aynı veriyi mobilde de görür. Şimdilik sadece kelime bankası + istatistik
// okuma/yazma taşındı (auth-context ve Profile/Achievements ekranlarının
// ihtiyacı); leaderboard/archive/grammar gibi Reading-hub'a özgü
// fonksiyonlar o iş başladığında ayrıca taşınacak, bkz. TODO.md.

export type UserWord = {
  id: string;
  word: string;
  translation: string;
  level: number;
  nextReview: number;
  correctCount: number;
  wrongCount: number;
  [key: string]: unknown;
};

export type UserStats = {
  streak: number;
  lastDate: string;
  dailyMinutes: number;
  correct: number;
  wrong: number;
  lastTestTime: number;
  weeklyMinutes?: number;
  weeklyReadings?: number;
  lastWeekNumber?: number;
};

function getWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ===== Kullanıcı kelime bankası =====

export async function getUserWords(uid: string): Promise<UserWord[]> {
  const snapshot = await getDocs(collection(db, 'users', uid, 'words'));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as UserWord);
}

export function subscribeToUserWords(uid: string, callback: (words: UserWord[]) => void) {
  return onSnapshot(collection(db, 'users', uid, 'words'), (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as UserWord));
  });
}

export async function addUserWord(uid: string, wordData: Record<string, unknown>) {
  const wordId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, 'users', uid, 'words', wordId), {
    ...wordData,
    level: 0,
    nextReview: Date.now(),
    correctCount: 0,
    wrongCount: 0,
    addedDate: serverTimestamp(),
  });
  return wordId;
}

export async function updateUserWord(uid: string, wordId: string, updates: Record<string, unknown>) {
  await updateDoc(doc(db, 'users', uid, 'words', wordId), updates);
}

export async function deleteUserWord(uid: string, wordId: string) {
  await deleteDoc(doc(db, 'users', uid, 'words', wordId));
}

// ===== Kullanıcı istatistikleri =====

const defaultStats: UserStats = {
  streak: 0,
  lastDate: '',
  dailyMinutes: 0,
  correct: 0,
  wrong: 0,
  lastTestTime: 0,
};

export async function getUserStats(uid: string): Promise<UserStats> {
  const statsRef = doc(db, 'users', uid, 'data', 'stats');
  const snap = await getDoc(statsRef);
  if (!snap.exists()) {
    await setDoc(statsRef, defaultStats);
    return defaultStats;
  }
  return snap.data() as UserStats;
}

export function subscribeToUserStats(uid: string, callback: (stats: UserStats) => void) {
  return onSnapshot(doc(db, 'users', uid, 'data', 'stats'), (snap) => {
    if (snap.exists()) callback(snap.data() as UserStats);
  });
}

export async function refreshUserStreak(uid: string) {
  const statsRef = doc(db, 'users', uid, 'data', 'stats');
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(statsRef);

  const today = new Date().toLocaleDateString('tr-TR');
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('tr-TR');

  const current = snap.exists() ? (snap.data() as UserStats) : { streak: 0, lastDate: '' };
  let { streak } = current;
  const { lastDate } = current;

  if (lastDate === today) return streak;
  streak = lastDate === yesterday ? streak + 1 : 1;

  await updateDoc(statsRef, { streak, lastDate: today });
  await updateDoc(userRef, {
    'publicStats.streak': streak,
    'publicStats.lastSeen': serverTimestamp(),
  });

  return streak;
}

export async function incrementStudyMinutes(uid: string, minutes: number) {
  const statsRef = doc(db, 'users', uid, 'data', 'stats');
  const userRef = doc(db, 'users', uid);

  const now = new Date();
  const today = now.toLocaleDateString('tr-TR');
  const weekNumber = getWeekNumber(now);

  const snap = await getDoc(statsRef);
  const data = snap.exists() ? (snap.data() as UserStats) : ({} as Partial<UserStats>);

  let weeklyMinutes = data.weeklyMinutes || 0;
  let weeklyReadings = data.weeklyReadings || 0;
  if (data.lastWeekNumber !== weekNumber) {
    weeklyMinutes = minutes;
    weeklyReadings = 0;
  } else {
    weeklyMinutes += minutes;
  }

  const dailyMinutes = data.lastDate !== today ? minutes : (data.dailyMinutes || 0) + minutes;

  await updateDoc(statsRef, {
    dailyMinutes,
    weeklyMinutes,
    weeklyReadings,
    lastWeekNumber: weekNumber,
    lastDate: today,
  });

  await updateDoc(userRef, {
    'publicStats.totalMinutes': increment(minutes),
    'publicStats.weeklyMinutes': weeklyMinutes,
    'publicStats.dailyMinutes': dailyMinutes,
    'publicStats.lastWeekNumber': weekNumber,
    'publicStats.lastDate': today,
  });
}

// Okuma quiz'i (3 soru) tamamlandığında çağrılıyor — web'in
// completeReadingPassage'ı ile aynı amaç: weeklyReadings sayacını
// artırmak (leaderboard'daki "Metin" kategorisi bunu okuyor, bkz.
// subscribeToLeaderboard). incrementStudyMinutes'taki hafta sıfırlama
// deseniyle aynı.
export async function completeReadingPassage(uid: string) {
  const statsRef = doc(db, 'users', uid, 'data', 'stats');
  const userRef = doc(db, 'users', uid);
  const weekNumber = getWeekNumber(new Date());

  const snap = await getDoc(statsRef);
  const data = snap.exists() ? (snap.data() as UserStats) : ({} as Partial<UserStats>);
  const weeklyReadings = data.lastWeekNumber === weekNumber ? (data.weeklyReadings || 0) + 1 : 1;

  await updateDoc(statsRef, { weeklyReadings, lastWeekNumber: weekNumber });
  await updateDoc(userRef, {
    'publicStats.weeklyReadings': weeklyReadings,
    'publicStats.lastWeekNumber': weekNumber,
  });
}

// SRS/Hatalarım oturumu bitince toplu doğru/yanlış sayacı — web'in
// updateUserStats'ı ile aynı (sadece bu oturumlardan besleniyor, okuma
// quiz'inden değil, bkz. araştırma notu).
export async function updateUserStats(uid: string, delta: { correct: number; wrong: number }) {
  const statsRef = doc(db, 'users', uid, 'data', 'stats');
  await updateDoc(statsRef, {
    correct: increment(delta.correct),
    wrong: increment(delta.wrong),
  });
}

// ===== Hatalarım =====
// Web'deki gibi ayrı bir döküman: users/{uid}/data/mistakes → { wrongIds: [] }.
// SRS/Hatalarım tekrarında yanlış cevaplanan kelime id'si eklenir, doğru
// cevaplanınca (Hatalarım testinde) listeden çıkarılır.

export async function getUserMistakes(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, 'users', uid, 'data', 'mistakes'));
  if (!snap.exists()) return [];
  return (snap.data().wrongIds as string[]) || [];
}

export async function addMistake(uid: string, wordId: string) {
  await setDoc(doc(db, 'users', uid, 'data', 'mistakes'), { wrongIds: arrayUnion(wordId) }, { merge: true });
}

export async function removeMistake(uid: string, wordId: string) {
  await updateDoc(doc(db, 'users', uid, 'data', 'mistakes'), { wrongIds: arrayRemove(wordId) });
}

export async function clearMistakes(uid: string) {
  await setDoc(doc(db, 'users', uid, 'data', 'mistakes'), { wrongIds: [] });
}

// ===== Liderlik tablosu =====
// Web'deki subscribeToLeaderboard (ydtfocusv2/src/lib/firestore.js) ile
// aynı sorgu deseni: users koleksiyonunda publicStats.<category> alanına
// göre sırala. weeklyWords kategorisi mobilde henüz izlenmediği için
// kapsam dışı (bkz. TODO.md — Reading-hub paneli).
export type LeaderboardCategory = 'streak' | 'weeklyMinutes' | 'dailyMinutes' | 'weeklyReadings';

export type LeaderboardEntry = {
  id: string;
  displayName: string;
  photoURL: string | null;
  role: 'free' | 'premium' | 'admin';
  publicStats?: Record<string, unknown>;
};

export function subscribeToLeaderboard(
  category: LeaderboardCategory,
  limitCount: number,
  callback: (entries: LeaderboardEntry[]) => void
) {
  const usersRef = collection(db, 'users');
  const field = `publicStats.${category}`;

  const now = new Date();
  const today = now.toLocaleDateString('tr-TR');
  const weekNumber = getWeekNumber(now);

  let q;
  if (category === 'weeklyMinutes' || category === 'weeklyReadings') {
    q = query(
      usersRef,
      where('publicStats.lastWeekNumber', '==', weekNumber),
      where(field, '>', 0),
      orderBy(field, 'desc'),
      limit(limitCount)
    );
  } else if (category === 'dailyMinutes') {
    q = query(
      usersRef,
      where('publicStats.lastDate', '==', today),
      where(field, '>', 0),
      orderBy(field, 'desc'),
      limit(limitCount)
    );
  } else {
    q = query(usersRef, where(field, '>', 0), orderBy(field, 'desc'), limit(limitCount));
  }

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as LeaderboardEntry));
  });
}

// ===== Çark Çevir + Hediye Premium =====
// Haftada 1 ücretsiz çevirme hakkı (bilinçli olarak kıt tutuluyor —
// amaç kullanıcıyı premium satın almaya yönlendirmek, günlük bedava
// çevirme kalıcı ihtiyacı ortadan kaldırıyordu) + rewarded ad ile
// haftada sınırlı ekstra hak, kazanılan/satın alınan premium günlerin
// hediye kodu üzerinden arkadaşa devri. Satın alınan hediyenin
// doğrulanması (Play Billing) web tarafında olmalı — bkz. TODO.md
// "Hediye/Çark" bölümü; grantPremiumDays/createGiftCode/redeemGiftCode
// burada sadece çarktan kazanılan (parasız) ödüller ve kod kullanma
// tarafı için. Hafta anahtarı olarak mevcut lastWeekNumber alanlarıyla
// aynı desen kullanılıyor (getWeekNumber, yıl sınırında ~1 haftalık
// çakışma riski var ama publicStats.lastWeekNumber'da da aynı ödün
// yapılmış).

export type WheelState = {
  lastFreeSpinWeek: number;
  lastAdSpinWeek: number;
  adSpinsUsedThisWeek: number;
};

const defaultWheelState: WheelState = {
  lastFreeSpinWeek: 0,
  lastAdSpinWeek: 0,
  adSpinsUsedThisWeek: 0,
};

const MAX_AD_SPINS_PER_WEEK = 2;

export async function getWheelState(uid: string): Promise<WheelState> {
  const snap = await getDoc(doc(db, 'users', uid, 'data', 'wheel'));
  if (!snap.exists()) return defaultWheelState;
  const data = snap.data() as Partial<WheelState>;
  const thisWeek = getWeekNumber(new Date());
  return {
    lastFreeSpinWeek: data.lastFreeSpinWeek || 0,
    lastAdSpinWeek: data.lastAdSpinWeek || 0,
    adSpinsUsedThisWeek: data.lastAdSpinWeek === thisWeek ? data.adSpinsUsedThisWeek || 0 : 0,
  };
}

export function canClaimFreeSpin(state: WheelState) {
  return state.lastFreeSpinWeek !== getWeekNumber(new Date());
}

export function canClaimAdSpin(state: WheelState) {
  return state.adSpinsUsedThisWeek < MAX_AD_SPINS_PER_WEEK;
}

export async function claimFreeSpin(uid: string) {
  const thisWeek = getWeekNumber(new Date());
  await setDoc(doc(db, 'users', uid, 'data', 'wheel'), { lastFreeSpinWeek: thisWeek }, { merge: true });
}

export async function claimAdSpin(uid: string) {
  const wheelRef = doc(db, 'users', uid, 'data', 'wheel');
  const thisWeek = getWeekNumber(new Date());
  const snap = await getDoc(wheelRef);
  const data = snap.exists() ? (snap.data() as Partial<WheelState>) : {};
  const usedThisWeek = data.lastAdSpinWeek === thisWeek ? data.adSpinsUsedThisWeek || 0 : 0;
  await setDoc(wheelRef, { lastAdSpinWeek: thisWeek, adSpinsUsedThisWeek: usedThisWeek + 1 }, { merge: true });
}

// Hem çarktan kendine kullanma hem hediye kodu kullanma bu fonksiyonu
// çağırır — premiumUntil gelecekteyse oradan, değilse şu andan itibaren
// uzatılır (PayTR webhook'unun yazdığı premiumUntil alanıyla aynı desen).
export async function grantPremiumDays(uid: string, days: number) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const current = snap.exists() ? (snap.data() as UserProfile) : null;
  const base = current?.premiumUntil && current.premiumUntil > Date.now() ? current.premiumUntil : Date.now();
  await updateDoc(userRef, {
    role: 'premium',
    premiumUntil: base + days * 86400000,
  });
}

function generateGiftCode() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

export type GiftCode = {
  code: string;
  fromUid: string;
  fromName: string;
  days: number;
  source: 'wheel' | 'purchase';
  createdAt: unknown;
  redeemed: boolean;
  redeemedBy: string | null;
  redeemedAt: unknown;
  playOrderId?: string;
};

export async function createGiftCode(
  uid: string,
  fromName: string,
  days: number,
  source: 'wheel' | 'purchase',
  playOrderId?: string
) {
  const code = generateGiftCode();
  await setDoc(doc(db, 'giftCodes', code), {
    code,
    fromUid: uid,
    fromName,
    days,
    source,
    createdAt: serverTimestamp(),
    redeemed: false,
    redeemedBy: null,
    redeemedAt: null,
    ...(playOrderId ? { playOrderId } : {}),
  });
  return code;
}

export type RedeemGiftResult = { ok: true; days: number } | { ok: false; error: string };

export async function redeemGiftCode(uid: string, rawCode: string): Promise<RedeemGiftResult> {
  const code = rawCode.trim().toUpperCase();
  const codeRef = doc(db, 'giftCodes', code);
  const userRef = doc(db, 'users', uid);

  try {
    const days = await runTransaction(db, async (tx) => {
      const codeSnap = await tx.get(codeRef);
      if (!codeSnap.exists()) throw new Error('NOT_FOUND');
      const giftData = codeSnap.data() as GiftCode;
      if (giftData.redeemed) throw new Error('ALREADY_REDEEMED');
      if (giftData.fromUid === uid) throw new Error('SELF_REDEEM');

      const userSnap = await tx.get(userRef);
      const current = userSnap.exists() ? (userSnap.data() as UserProfile) : null;
      const base = current?.premiumUntil && current.premiumUntil > Date.now() ? current.premiumUntil : Date.now();

      tx.update(codeRef, { redeemed: true, redeemedBy: uid, redeemedAt: serverTimestamp() });
      tx.update(userRef, { role: 'premium', premiumUntil: base + giftData.days * 86400000 });

      return giftData.days;
    });
    return { ok: true, days };
  } catch (err) {
    const message = (err as Error)?.message;
    if (message === 'NOT_FOUND') return { ok: false, error: 'Kod bulunamadı.' };
    if (message === 'ALREADY_REDEEMED') return { ok: false, error: 'Bu kod zaten kullanılmış.' };
    if (message === 'SELF_REDEEM') return { ok: false, error: 'Kendi kodunu kullanamazsın.' };
    return { ok: false, error: 'Kod kullanılamadı, tekrar deneyin.' };
  }
}

// ===== Kullanıcı profili (users/{uid} dökümanı) =====

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string;
  searchName: string;
  photoURL: string | null;
  role: 'free' | 'premium' | 'admin';
  premiumUntil?: number;
  [key: string]: unknown;
};

export async function ensureUserProfile(
  uid: string,
  info: { email: string | null; displayName: string | null; photoURL: string | null }
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const fallbackName = info.displayName || info.email?.split('@')[0] || 'Kullanıcı';

  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      email: info.email,
      displayName: fallbackName,
      searchName: fallbackName.toLowerCase(),
      photoURL: info.photoURL || null,
      role: 'free',
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
    return;
  }

  const current = snap.data() as UserProfile;
  const updates: Record<string, unknown> = { lastLogin: serverTimestamp() };

  if ((!current.displayName || current.displayName === 'Kullanıcı') && info.displayName) {
    updates.displayName = info.displayName;
    updates.searchName = info.displayName.toLowerCase();
  }
  if (!current.photoURL && info.photoURL) {
    updates.photoURL = info.photoURL;
  }

  await setDoc(userRef, updates, { merge: true });
}
