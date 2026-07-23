// Web sitesinin (ydtfocusv2) /api/* route'larını çağıran istemci —
// prompt'lar ve API anahtarları SADECE web reposunda yaşar (bkz.
// PROJECT_STATUS.md "Backend stratejisi"), burada tekrar edilmez.
// Web tarafında bu route'ların mobil origin'ine (Expo dev server + prod
// app scheme) CORS izni vermesi gerekebilir — bkz. TODO.md.

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

export type ReadingPassage = {
  title: string;
  text: string;
  tr: string;
  trTitle: string;
  thumbnail: string;
  url: string;
};

// topic: web'deki TOPIC_SEARCH_MAP anahtarlarından biri (animals, history,
// science, ...) veya "random"
export function fetchReadingPassage(topic: string) {
  return postJson<ReadingPassage>('/api/wikipedia', { topic });
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
  return postJson<VerifyGiftResult>('/api/play-billing/verify-gift', { purchaseToken, productId });
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
