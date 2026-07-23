import { Animated, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import { getSpinSegments } from '@/constants/spin-wheel';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 240;
const RADIUS = SIZE / 2;
const CENTER = SIZE / 2;

function polarToCartesian(angleDeg: number, radius: number) {
  // SVG'de 0° saat 3 yönünü gösterir, ibre üstte (12 yönü, -90°) sabit
  // olduğu için segment çizimini de aynı referansa göre kaydırıyoruz.
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angleRad), y: CENTER + radius * Math.sin(angleRad) };
}

function segmentPath(startAngle: number, endAngle: number) {
  const start = polarToCartesian(startAngle, RADIUS - 2);
  const end = polarToCartesian(endAngle, RADIUS - 2);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS - 2} ${RADIUS - 2} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

const AnimatedView = Animated.View;

type Props = { rotate: Animated.AnimatedInterpolation<string> };

export function SpinWheelGraphic({ rotate }: Props) {
  const theme = useTheme();
  const segments = getSpinSegments();

  return (
    <View style={{ width: SIZE, height: SIZE + 20, alignItems: 'center' }}>
      {/* İbre — sabit, çark döner */}
      <Svg width={24} height={20} style={{ marginBottom: -6, zIndex: 1 }}>
        <Path d="M 12 20 L 2 0 L 22 0 Z" fill={theme.accent} />
      </Svg>

      <AnimatedView style={{ width: SIZE, height: SIZE, transform: [{ rotate }] }}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={CENTER} cy={CENTER} r={RADIUS - 2} fill={theme.bgElevated} stroke={theme.border} strokeWidth={2} />
          {segments.map((segment, idx) => {
            const mid = (segment.startAngle + segment.endAngle) / 2;
            const labelPos = polarToCartesian(mid, RADIUS * 0.62);
            return (
              <G key={segment.label + idx}>
                <Path
                  d={segmentPath(segment.startAngle, segment.endAngle)}
                  fill={segment.days > 0 ? theme.accent : theme.bgCard}
                  fillOpacity={segment.days > 0 ? 0.35 + idx * 0.15 : 1}
                  stroke={theme.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={labelPos.x}
                  y={labelPos.y}
                  fill={segment.days > 0 ? theme.accent : theme.textMuted}
                  fontSize={12}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {segment.days > 0 ? `${segment.days}g` : '—'}
                </SvgText>
              </G>
            );
          })}
          <Circle cx={CENTER} cy={CENTER} r={16} fill={theme.accent} />
        </Svg>
      </AnimatedView>
    </View>
  );
}
