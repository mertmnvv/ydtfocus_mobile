// Web'deki SrsPanel.js ile birebir aynı seviye/aralık tablosu ve
// yanlış-cevap distractor havuzu (bkz. ydtfocusv2/src/components/hub-panels/SrsPanel.js).
export const LEVEL_INTERVALS = [0.5, 1, 3, 7, 15];

export const FALLBACK_DISTRACTORS = [
  'gitmek',
  'almak',
  'vermek',
  'görmek',
  'bilmek',
  'yapmak',
  'söylemek',
  'düşünmek',
  'istemek',
  'bulmak',
];

export type QuizOption = { text: string; isCorrect: boolean };

// Doğru cevap + kelime bankasından/fallback listesinden 3 rastgele
// çeldirici — web'in aynı mantığı (diğer kelimelerin çevirileri +
// fallback havuzu, karıştırılmış).
export function buildQuizOptions(correctTranslation: string, otherTranslations: string[]): QuizOption[] {
  const pool = [...otherTranslations, ...FALLBACK_DISTRACTORS].filter(
    (t) => t && t.toLowerCase() !== correctTranslation.toLowerCase()
  );
  const distractors: string[] = [];
  while (distractors.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const [picked] = pool.splice(idx, 1);
    if (!distractors.includes(picked)) distractors.push(picked);
  }
  const options: QuizOption[] = [
    { text: correctTranslation, isCorrect: true },
    ...distractors.map((text) => ({ text, isCorrect: false })),
  ];
  // Fisher-Yates
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}
