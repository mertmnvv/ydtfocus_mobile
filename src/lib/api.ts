// Web sitesinin (ydtfocusv2) /api/* route'larını çağıran istemci —
// prompt'lar ve API anahtarları SADECE web reposunda yaşar (bkz.
// PROJECT_STATUS.md "Backend stratejisi"), burada tekrar edilmez.
// Web tarafında bu route'ların mobil origin'ine (Expo dev server + prod
// app scheme) CORS izni vermesi gerekebilir — bkz. TODO.md.

import { auth } from '@/lib/firebase';

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Sunucu hatası oluştu.');
  return data as T;
}

// Kullanıcının kimliğini doğrulaması gereken route'lar için (Play Billing
// verify-gift/verify-subscription — web tarafı `Authorization: Bearer
// <Firebase ID token>` bekliyor ve token'dan uid'i çözüyor, bkz.
// ydtfocusv2/src/app/api/play-billing/*/route.js `adminAuth.verifyIdToken`).
async function postJsonAuthed<T>(path: string, body: unknown): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Giriş yapmanız gerekiyor.');
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Sunucu hatası oluştu.');
  return data as T;
}

export type ReadingPassage = {
  title: string;
  text: string;
  tr: string;
  trTitle: string;
  thumbnail: string;
  url: string;
};

// topic: web'deki TOPIC_SEARCH_MAP anahtarlarından biri (animals, history,
// science, ...) veya "random". level opsiyonel — web'in /api/wikipedia
// route'u artık CEFR seviyesine göre metni sadeleştiriyor (paralel
// çalışan bir agent web tarafında ekledi), göndermezsen eski davranış
// (sadeleştirmesiz) devam eder, response şekli değişmedi.
export function fetchReadingPassage(topic: string, level?: ReadingLevel) {
  return postJson<ReadingPassage>('/api/wikipedia', { topic, level });
}

export type WordLookup = {
  en: string;
  tr: string;
  synonyms: string;
  antonym: string;
  definition: string;
  phonetic: string;
  source: 'dictionary' | 'ai' | 'error';
};

export function lookupWord(word: string) {
  return postJson<WordLookup>('/api/translate', { word });
}

// Ses dosyasını ham ArrayBuffer olarak döner — RN'de çalma stratejisi
// (dosyaya yazıp expo-av/expo-audio ile oynatma) Reading ekranı işine ait.
export async function fetchSpeechAudio(text: string, voice?: string): Promise<ArrayBuffer> {
  const response = await fetch(`${BASE_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!response.ok) throw new Error('Ses oluşturulamadı.');
  return response.arrayBuffer();
}

// Groq chat completion'a doğrudan geçiş — body, Groq'un beklediği
// { model, messages, ... } şeklinde olmalı (bkz. ydtfocusv2/src/constants/prompts.js)
export function callGroq<T = unknown>(body: Record<string, unknown>) {
  return postJson<T>('/api/groq', body);
}

// ── AI-üretimli okuma metni (sourceMode: "ai") ──
// Web'de dedike bir /api/reading route'u yok — ydtfocusv2/src/app/(app)/reading/page.js
// da aynı şekilde generic /api/groq passthrough'una prompt'u kendisi kurup
// gönderiyor (bkz. buildReadingPassagePrompt, ydtfocusv2/src/constants/prompts.js).
// Prompt metni burada bilerek birebir yansıtılıyor — web'de ayrı bir AI-reading
// route'u olmadığından tek doğruluk kaynağından çekmek mümkün değil; web'in
// prompt'u değişirse burası da elle güncellenmeli.
export type ReadingLevel = 'A2' | 'B1' | 'B2' | 'C1';

type GroqChatResponse = {
  choices: { message: { content: string } }[];
};

type AiPassageJson = {
  title: string;
  en: string;
  tr: string;
  key_vocabulary?: unknown;
  grammar_patterns?: unknown;
};

function buildReadingPassagePrompt(level: ReadingLevel, topic: string) {
  return `You are an expert ESL content writer creating a reading passage for a YDT/YKS exam prep app.

Target Level: ${level} CEFR
Topic: ${topic}

Style requirements:
- Professional, academic tone similar to Nature or The Economist.
- Use complex clauses and passive voice where natural; avoid simplistic subject-verb-object sentences.
- No typos or grammar mistakes.
- Length: 150-200 words.

Return ONLY a JSON object with this exact shape, no extra text:
{
  "title": "string",
  "en": "string (the English passage)",
  "tr": "string (accurate Turkish translation of the passage)",
  "key_vocabulary": [{ "word": "string", "type": "string", "tr": "string" }],
  "grammar_patterns": [{ "title": "string", "description": "string", "description_tr": "string", "found_in_text": "string", "examples": [{ "en": "string", "tr": "string" }] }]
}`;
}

// AI-üretimli pasajlarda Wikipedia modundaki thumbnail/url/trTitle alanları
// yok (web'deki generateAIText de bunları doldurmuyor) — ReadingPassage
// tipiyle uyumlu kalmak için boş string döner.
// Play Billing üzerinden satın alınan "hediye premium" doğrulaması —
// bu route ydtfocusv2'de henüz yok (bkz. TODO.md "Hediye/Çark" bölümü,
// web reposunda ön koşul olarak not düşüldü). Sunucu Google Play
// Developer API ile satın almayı doğrulayıp giftCodes dökümanını kendi
// tarafında oluşturmalı — client asla kendi premiumUntil'ini yazmaz.
export type VerifyGiftResult = { giftCode: string; days: number };

export function verifyGiftPurchase(purchaseToken: string, productId: string) {
  return postJsonAuthed<VerifyGiftResult>('/api/play-billing/verify-gift', { purchaseToken, productId });
}

// Premium abonelik doğrulaması — PayTR'nin mobil karşılığı yerine Play
// Billing (bkz. src/lib/iap.ts üstteki not).
// premiumUntil web'in PayTR callback'iyle aynı formatta: ISO tarih string'i.
export type VerifyPremiumResult = { premiumUntil: string };

export function verifyPremiumPurchase(purchaseToken: string, productId: string) {
  return postJsonAuthed<VerifyPremiumResult>('/api/play-billing/verify-subscription', { purchaseToken, productId });
}

// Okuma quiz'i — web'in buildReadingQuizPrompt'u ile birebir aynı
// (bkz. ydtfocusv2/src/constants/prompts.js), aynı /api/groq passthrough
// üzerinden. Web'de dedike bir /api/quiz route'u yok, bu yüzden AI
// pasaj promptu gibi burada da prompt metni mobilde yansıtılıyor.
export type QuizQuestion = { q: string; a: string; b: string; c: string; d: string; correct: 'a' | 'b' | 'c' | 'd' };

type QuizJson = { questions: QuizQuestion[] };

function buildReadingQuizPrompt(text: string) {
  return `Based on the text below, create exactly 3 multiple-choice questions.
    Return ONLY a valid JSON object with key "questions" containing an array of 3 objects.
    Each object keys: "q" (question), "a", "b", "c", "d" (options), "correct" (value: a/b/c/d).
    Text: ${text}`;
}

export async function fetchReadingQuiz(text: string): Promise<QuizQuestion[]> {
  const response = await callGroq<GroqChatResponse>({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: buildReadingQuizPrompt(text) }],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });
  const parsed = JSON.parse(response.choices[0].message.content) as QuizJson;
  return parsed.questions;
}

export async function fetchAiPassage(topic: string, level: ReadingLevel): Promise<ReadingPassage> {
  const response = await callGroq<GroqChatResponse>({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: buildReadingPassagePrompt(level, topic) }],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });
  const parsed = JSON.parse(response.choices[0].message.content) as AiPassageJson;
  return {
    title: parsed.title,
    text: parsed.en,
    tr: parsed.tr,
    trTitle: '',
    thumbnail: '',
    url: '',
  };
}

// Kartlar (Flashcards) — web'in dedike /api/generate-deck route'unu
// kullanır (generic /api/groq passthrough'unun aksine), bu yüzden
// prompt mobilde tekrar edilmiyor; web'deki buildFlashcardDeckPrompt
// tek doğruluk kaynağı olarak kalıyor.
export type GeneratedFlashcard = { word: string; meaning: string; sentence: string };

export function generateFlashcardDeck(topic: string, level: ReadingLevel, count: number) {
  return postJson<GeneratedFlashcard[]>('/api/generate-deck', { topic, level, count });
}

// Tek kart için örnek cümle — web'in "sihirli değnek" butonuyla aynı,
// generic /api/groq passthrough + buildExampleSentencePrompt (bkz.
// ydtfocusv2/src/constants/prompts.js) birebir yansıtıldı.
function buildExampleSentencePrompt(word: string, meaning: string, level: string) {
  return `Create a short, simple ${level} level English example sentence for the word "${word}" (meaning: ${meaning}). Return ONLY the sentence.`;
}

// Zorunlu seviye tespit sınavı — kayıt sonrası bir kere (veya profilden
// "Seviyeni Yükselt" ile tekrar) sorulan 10 soruluk CEFR testi. Web'de
// dedike bir route yok, fetchReadingQuiz/fetchAiPassage deseninin aynısı:
// generic /api/groq passthrough'una prompt'u burada kurup gönderiyoruz.
export type LevelTestQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  level: ReadingLevel;
};

function buildLevelTestPrompt() {
  return `You are an English proficiency test generator for Turkish-speaking learners. Create exactly 10 multiple-choice English grammar/vocabulary questions to measure a CEFR level (A2, B1, B2, C1).
    IMPORTANT: The question text and all 4 options must be written ENTIRELY IN ENGLISH (this is an English test, not a Turkish one). Each question must test a genuine grammar or vocabulary point (e.g. verb tenses, prepositions, word choice) with exactly one clearly correct answer among 4 distinct options — never repeat the same option twice.
    Difficulty must increase across the set: questions 1-2 at A2 level, 3-5 at B1 level, 6-8 at B2 level, 9-10 at C1 level.
    Return ONLY a valid JSON object with a single key "questions" containing an array of exactly 10 objects. Each object keys: "question" (string, in English), "options" (array of exactly 4 distinct English strings), "correctIndex" (integer 0-3), "level" (one of "A2","B1","B2","C1").`;
}

// Groq bazen JSON'u markdown code fence içine sarabiliyor veya array'i
// {"questions":[...]} gibi bir objeye sarabiliyor — fetchReadingQuiz'deki
// gibi dayanıklı parse ediliyor.
function parseLevelTestJson(raw: string): LevelTestQuestion[] {
  const cleaned = raw.replace(/```json\s*|```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed as LevelTestQuestion[];
  if (Array.isArray((parsed as { questions?: unknown }).questions)) {
    return (parsed as { questions: LevelTestQuestion[] }).questions;
  }
  throw new Error('Beklenmeyen sınav formatı.');
}

export async function fetchLevelTestQuestions(): Promise<LevelTestQuestion[]> {
  const response = await callGroq<GroqChatResponse>({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: buildLevelTestPrompt() }],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });
  return parseLevelTestJson(response.choices[0].message.content);
}

export async function generateExampleSentence(word: string, meaning: string, level: ReadingLevel) {
  const response = await callGroq<GroqChatResponse>({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: 'You are an English teacher.' },
      { role: 'user', content: buildExampleSentencePrompt(word, meaning, level) },
    ],
    temperature: 0.3,
  });
  return response.choices[0].message.content.trim();
}
