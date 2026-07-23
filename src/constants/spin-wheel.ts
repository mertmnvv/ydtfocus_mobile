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

export type SpinResult = { prize: SpinPrize; landingAngle: number };

// landingAngle: çark üzerinde 0°-360° arası, ibrenin (üstte, sabit)
// gerçekte hangi noktada duracağını belirler — animasyon bu açıya göre
// döndürme miktarını hesaplar.
export function pickSpinPrize(): SpinResult {
  const segments = getSpinSegments();
  const roll = Math.random() * 360;
  const segment = segments.find((s) => roll >= s.startAngle && roll < s.endAngle) ?? segments[segments.length - 1];
  return { prize: segment, landingAngle: roll };
}
