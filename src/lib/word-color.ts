import type { Colors } from '@/constants/theme';

type Theme = (typeof Colors)['dark'] | (typeof Colors)['light'];

// Kelime bankasına eklenmiş kelimeleri pasajda kalıcı olarak vurgulamak için
// kullanılan renk seçimi. "Akademik/zor kelime" ayrımı için web tarafında da
// (ydtfocusv2) CEFR/akademik bir kelime listesi bulunmuyor — bu yüzden basit
// bir sezgi kullanıyoruz: 8+ harfli kelimeler İngilizce'de genelde daha
// akademik/nadir sözcüklerdir (bkz. Latin kökenli uzun kelimeler), kısa
// kelimeler ise günlük/temel kelime dağarcığına ait olma eğilimindedir.
// Gerçek bir CEFR sınıflandırması eklenirse bu fonksiyon güncellenmeli.
const ACADEMIC_LENGTH_THRESHOLD = 8;

export function getWordHighlightColor(word: string, isSaved: boolean, theme: Theme): string | undefined {
  if (!isSaved) return undefined;
  return word.length >= ACADEMIC_LENGTH_THRESHOLD ? theme.academicWord : theme.savedWord;
}
