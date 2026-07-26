import { Fragment, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DailyStatEntry } from '@/lib/firestore';

type Props = {
  entries: DailyStatEntry[];
};

const DAY_LABELS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const CHART_HEIGHT = 120;
const BAR_GAP = 10;

// Son 7 günü, bugünden geriye doğru sabit 7 slotluk bir takvim olarak
// oluşturur — dailyStats'ta o güne ait kayıt yoksa (ör. hesap yeni
// açıldıysa veya o gün uygulama hiç açılmadıysa) slot "veri yok" olarak
// işaretlenir, grafik çökmez/bozulmaz, sadece boş/kısa gösterilir.
function buildLast7Days(entries: DailyStatEntry[]) {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const days: { date: string; label: string; minutes: number | null }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${day}`;
    const entry = byDate.get(key);
    days.push({ date: key, label: DAY_LABELS[d.getDay()], minutes: entry ? entry.minutes : null });
  }
  return days;
}

// Profil ekranındaki "Zaman İçinde İlerleme" grafiği — son 7 günün günlük
// çalışma süresini (dakika) basit bir çubuk grafik olarak gösterir.
// Yeni bir bağımlılık YOK: mevcut react-native-svg ile elle çizildi
// (bkz. spin-wheel-graphic.tsx aynı yaklaşımı kullanıyor).
export function ProgressChart({ entries }: Props) {
  const theme = useTheme();
  const days = useMemo(() => buildLast7Days(entries), [entries]);
  const hasAnyData = days.some((d) => d.minutes !== null && d.minutes > 0);
  const missingEarlyData = days.some((d) => d.minutes === null);

  const maxMinutes = Math.max(1, ...days.map((d) => d.minutes ?? 0));
  const barWidth = 28;
  const chartWidth = days.length * (barWidth + BAR_GAP);

  return (
    <View>
      {hasAnyData ? (
        <Svg width={chartWidth} height={CHART_HEIGHT + 24}>
          <Line
            x1={0}
            y1={CHART_HEIGHT}
            x2={chartWidth}
            y2={CHART_HEIGHT}
            stroke={theme.border}
            strokeWidth={1}
          />
          {days.map((day, idx) => {
            const x = idx * (barWidth + BAR_GAP);
            const minutes = day.minutes ?? 0;
            const barHeight = day.minutes === null ? 0 : Math.max(3, (minutes / maxMinutes) * (CHART_HEIGHT - 8));
            const y = CHART_HEIGHT - barHeight;
            return (
              <Fragment key={day.date}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={4}
                  fill={day.minutes === null ? theme.border : theme.accent}
                  opacity={day.minutes === null ? 0.4 : 1}
                />
                <SvgText
                  x={x + barWidth / 2}
                  y={CHART_HEIGHT + 18}
                  fontSize={11}
                  fill={theme.textMuted}
                  textAnchor="middle"
                >
                  {day.label}
                </SvgText>
              </Fragment>
            );
          })}
        </Svg>
      ) : (
        <ThemedText themeColor="textMuted" type="small" style={styles.emptyText}>
          Henüz yeterli çalışma verisi yok.
        </ThemedText>
      )}
      {missingEarlyData ? (
        <ThemedText themeColor="textMuted" type="small" style={styles.note}>
          Geçmiş veri birikmeye devam ediyor.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: { paddingVertical: Spacing.four, textAlign: 'center' },
  note: { marginTop: Spacing.two },
});
