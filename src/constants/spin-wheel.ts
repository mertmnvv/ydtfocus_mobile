// Çark Çevir ödül tablosu — ağırlıklar buradan ayarlanır, oyun mantığı
// başka yerde bu tabloyu tekrar etmez. Segment açıları da ağırlıklara
// göre hesaplanıyor, yani çarkın görsel dilim boyutları gerçek kazanma
// olasılığıyla birebir örtüşüyor (göstermelik eşit dilimler değil).
export type SpinPrize = { days: number; label: string; weight: number };

export const SPIN_PRIZES: SpinPrize[] = [
  { days: 0, label: 'Bir Dahaki Sefere', weight: 50 },
  { days: 1, label: '1 Gün Premium', weight: 30 },
  { days: 3, label: '3 Gün Premium', weight: 15 },
  { days: 7, label: '7 Gün Premium', weight: 5 },
];

export type SpinSegment = SpinPrize & { startAngle: number; endAngle: number };

export function getSpinSegments(): SpinSegment[] {
  const total = SPIN_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let angle = 0;
  return SPIN_PRIZES.map((prize) => {
    const sweep = (prize.weight / total) * 360;
    const segment: SpinSegment = { ...prize, startAngle: angle, endAngle: angle + sweep };
    angle += sweep;
    return segment;
  });
}

// Ödül artık spinWheel Cloud Function'ında (ydtfocusv2/functions/index.js)
// belirleniyor — client kendi ödülünü seçemiyor (bkz. TODO.md "Güvenlik
// notu"). Bu fonksiyon sadece sunucudan dönen `days` değeri için,
// SADECE animasyon amacıyla, o dilimin açı aralığında rastgele bir
// "iniş açısı" üretir — gerçek ödülü etkilemez, salt görsel.
export function landingAngleForDays(days: number): number {
  const segments = getSpinSegments();
  const segment = segments.find((s) => s.days === days) ?? segments[0];
  return segment.startAngle + Math.random() * (segment.endAngle - segment.startAngle);
}
