export type WordStatus = 'new' | 'learning' | 'mastered';

export function getWordStatus(level: number): WordStatus {
  if (level <= 0) return 'new';
  if (level >= 4) return 'mastered';
  return 'learning';
}

export function getWordStatusLabel(level: number): string {
  const status = getWordStatus(level);
  switch (status) {
    case 'new':
      return 'Yeni';
    case 'learning':
      return 'Öğreniliyor';
    case 'mastered':
      return 'Ustalaşıldı';
  }
}

export function getWordStatusColors(level: number, theme: any) {
  const status = getWordStatus(level);
  switch (status) {
    case 'new':
      return {
        bg: theme.bgElevated,
        text: theme.textMuted,
        border: theme.border,
      };
    case 'learning':
      return {
        bg: theme.accent,
        text: '#0b0b0c', // Koyu renk, altın sarısı üzerinde daha okunabilir
        border: 'transparent',
      };
    case 'mastered':
      return {
        bg: theme.savedWord,
        text: '#ffffff', // Beyaz renk, yeşil üzerinde mükemmel okunabilirlik sağlar
        border: 'transparent',
      };
  }
}
