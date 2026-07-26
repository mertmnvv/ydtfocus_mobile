import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  type DocumentSnapshot,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryConstraint,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
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

// Doküman ID'si kelimenin kendisinden türetiliyor (Date.now()_random yerine)
// — böylece aynı kelime tekrar eklenmeye çalışılırsa setDoc var olan
// dokümanın ÜZERİNE yazar, yinelenen kayıt oluşmaz. Harf dışı karakterler
// atılıp küçük harfe çevrilir (case-insensitive eşleşme).
function wordDocId(word: string) {
  return word.toLowerCase().replace(/[^a-z]/g, '') || `w${Date.now()}`;
}

export async function addUserWord(uid: string, wordData: Record<string, unknown>) {
  const word = String(wordData.word ?? '');
  const wordId = wordDocId(word);
  const existing = await getDoc(doc(db, 'users', uid, 'words', wordId));
  if (existing.exists()) return wordId;
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
// amaç kullanıcıyı premium satın almaya yönlendirmek). Ödül belirleme,
// hak kontrolü, premiumUntil/role yazımı ve hediye kodu oluşturma/
// kullanma artık TAMAMEN sunucu tarafında — Cloud Functions
// (ydtfocusv2/functions/index.js → spinWheel/claimWheelPrize/
// redeemGiftCode, bkz. src/lib/functions.ts). Bu bilerek böyle: client
// kendi ödülünü/hediye kodunu doğrudan yazabiliyor olsaydı (önceki
// tasarım) `days:9999` gibi sahte bir kod üretip başka hesapta
// kullanabilirdi — bkz. TODO.md "Güvenlik notu".
// Burada sadece "kaç hakkın var" bilgisini GÖSTERMEK için salt-okunur
// bir durum kalıyor (`users/{uid}/data/wheel` — client artık bu
// dökümana yazamıyor, bkz. ydtfocusv2/firestore.rules).

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

// premiumUntil web'de (PayTR callback, ydtfocusv2/src/app/api/paytr/callback/route.js
// ve artık Cloud Functions/route'lar) ISO tarih STRING'i olarak
// yazılıyor, sayı değil — auth-context.tsx'teki isPremium kontrolü bu
// yüzden ham karşılaştırma yerine bu yardımcıyı kullanıyor.
export function premiumUntilMs(value: string | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

// ===== Kullanıcı profili (users/{uid} dökümanı) =====

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string;
  searchName: string;
  photoURL: string | null;
  role: 'free' | 'premium' | 'admin';
  // ISO tarih string'i (PayTR callback'in yazdığı formatla aynı,
  // bkz. premiumUntilMs) — sayı/timestamp DEĞİL.
  premiumUntil?: string;
  // Zorunlu seviye tespit sınavının sonucu — kayıt sırasında YAZILMAZ
  // (bilerek eksik bırakılıyor), "sınav girmemiş" tespiti !userProfile.level
  // ile yapılıyor (bkz. _layout.tsx RootNavigator, level-test.tsx).
  level?: 'A2' | 'B1' | 'B2' | 'C1';
  levelSetAt?: string;
  // Kullanıcının hedeflediği sınav tarihi — tarih-sadece ISO string
  // ("2027-06-20"), saat/timezone bilgisi taşımaz (bkz. profile.tsx
  // gün-sayımı hesaplaması). Kayıt sırasında yazılmaz, profilden
  // isteğe bağlı olarak girilir/güncellenir.
  examDate?: string;
  // Kullanıcının kendi belirlediği günlük çalışma hedefi (dakika) —
  // "Kendi Hedef Belirleme" özelliği, streak'ten bağımsız. Ayarlar'dan
  // seçilir (bkz. settings.tsx), Profil'de stats.dailyMinutes ile
  // karşılaştırılıp ilerleme çubuğu gösterilir (bkz. profile.tsx).
  // Kullanıcı seçmediyse tanımsız kalır, zorla varsayılan atanmaz.
  dailyGoalMinutes?: number;
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

// Zorunlu seviye tespit sınavı bitince (onboarding) veya "Seviyeni
// Yükselt" ile yeniden girildiğinde (retake) çağrılıyor — bkz.
// src/app/level-test.tsx. userProfile.level'ı onSnapshot ile canlı
// dinleyen AuthProvider sayesinde _layout.tsx buna otomatik tepki verir.
export async function setUserLevel(uid: string, level: string) {
  await updateDoc(doc(db, 'users', uid), { level, levelSetAt: new Date().toISOString() });
}

// "Kendi Hedef Belirleme" — kullanıcının Ayarlar'dan seçtiği günlük
// çalışma dakikası hedefi. setUserLevel ile aynı basit updateDoc deseni.
export async function setDailyGoalMinutes(uid: string, minutes: number): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { dailyGoalMinutes: minutes });
}

// Web'deki useFcmToken.js / firestore.js updateFcmToken ile AYNI alan
// adları (users/{uid}.fcmToken tekil string, çoklu cihaz desteklenmiyor —
// web'de de öyle). Web'in cron tabanlı hatırlatma gönderimi
// (api/notifications/remind/route.js) bu alanı doğrudan okuyor, bu
// yüzden isim/şekil birebir uyuşmalı.
// Profildeki "Sınav Geri Sayımı" kartı için — setUserLevel ile aynı
// basit updateDoc deseni (bkz. yukarısı).
export async function setExamDate(uid: string, examDate: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { examDate });
}

export async function updateFcmToken(uid: string, token: string) {
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, { fcmToken: token, lastTokenUpdate: serverTimestamp() }, { merge: true });
}

// ===== Sözlük (Akademik Sözlük / Archive) =====
// Web'deki ArchivePanel.js ile aynı: global `archive` koleksiyonu
// (admin-write, herkes okuyabilir — bkz. ydtfocusv2/firestore.rules),
// sayfalama + seviye filtresi. Arama web'de de sunucu sorgusu değil,
// yüklenen sayfa üzerinde istemci tarafı filtre.

export type ArchiveWord = {
  id: string;
  word: string;
  meaning: string;
  syn?: string;
  level?: string;
};

const ARCHIVE_PAGE_SIZE = 30;

export async function getArchiveWords(
  level: string | null,
  cursor: DocumentSnapshot | null
): Promise<{ words: ArchiveWord[]; lastDoc: DocumentSnapshot | null }> {
  const archiveRef = collection(db, 'archive');
  const constraints: QueryConstraint[] = [orderBy('word'), limit(ARCHIVE_PAGE_SIZE)];
  if (level && level !== 'Tümü') constraints.unshift(where('level', '==', level));
  if (cursor) constraints.push(startAfter(cursor));
  const q = query(archiveRef, ...constraints);
  const snapshot = await getDocs(q);
  return {
    words: snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ArchiveWord),
    lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
  };
}

// ===== Gramer Ansiklopedisi =====
// Statik, admin tarafından yazılan içerik — AI üretimi yok. Web'deki
// GrammarPanel.js ile aynı: grammarTopics koleksiyonu, sortOrder'a göre.

export type GrammarTopic = {
  id: string;
  sortOrder: number;
  title: string;
  content: string;
  tactics?: string;
};

export async function getGrammarTopics(): Promise<GrammarTopic[]> {
  const snapshot = await getDocs(query(collection(db, 'grammarTopics'), orderBy('sortOrder')));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GrammarTopic);
}

// ===== Kartlar (Flashcard Deste) =====
// users/{uid}/flashcardDecks/{deckId} — web'deki FlashcardsHubPanel.js ile
// aynı şekil: { name, cards: [{word, meaning, sentence, status}],
// totalStudied, lastStudied, createdAt }. AI ile deste üretimi web'in
// dedike /api/generate-deck route'u üzerinden (bkz. src/lib/api.ts →
// generateFlashcardDeck) — prompt web'de kaldığından burada tekrar
// edilmiyor (generic /api/groq passthrough'unun aksine bu route zaten
// mobil origin'den de çağrılabilir durumda olmalı, aynı CORS notu
// gecerli, bkz. TODO.md).

export type FlashcardStatus = 'new' | 'known' | 'unknown';

export type FlashcardCard = {
  word: string;
  meaning: string;
  sentence?: string;
  status: FlashcardStatus;
};

export type FlashcardDeck = {
  id: string;
  name: string;
  level?: string;
  cards: FlashcardCard[];
  totalStudied: number;
  lastStudied?: number;
  createdAt?: unknown;
};

export function subscribeToUserDecks(uid: string, callback: (decks: FlashcardDeck[]) => void) {
  return onSnapshot(collection(db, 'users', uid, 'flashcardDecks'), (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as FlashcardDeck));
  });
}

export async function createDeck(uid: string, name: string, level: string, cards: FlashcardCard[]) {
  const deckId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, 'users', uid, 'flashcardDecks', deckId), {
    name,
    level,
    cards,
    totalStudied: 0,
    createdAt: serverTimestamp(),
  });
  return deckId;
}

// "Sihirli değnek" — tek bir kart için üretilen örnek cümleyi kaydeder,
// status/totalStudied'a dokunmadan (bkz. web'in FlashcardsHubPanel.js
// aynı butonu).
export async function updateCardSentence(uid: string, deck: FlashcardDeck, cardIndex: number, sentence: string) {
  const cards = deck.cards.map((c, i) => (i === cardIndex ? { ...c, sentence } : c));
  await updateDoc(doc(db, 'users', uid, 'flashcardDecks', deck.id), { cards });
}

export async function deleteDeck(uid: string, deckId: string) {
  await deleteDoc(doc(db, 'users', uid, 'flashcardDecks', deckId));
}

export async function updateCardStatus(
  uid: string,
  deck: FlashcardDeck,
  cardIndex: number,
  status: FlashcardStatus
) {
  const cards = deck.cards.map((c, i) => (i === cardIndex ? { ...c, status } : c));
  await updateDoc(doc(db, 'users', uid, 'flashcardDecks', deck.id), {
    cards,
    totalStudied: increment(1),
    lastStudied: Date.now(),
  });
}
