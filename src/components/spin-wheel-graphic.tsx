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
  const start = polarToCartesian(startAngle, RADIUS - 4);
  const end = polarToCartesian(endAngle, RADIUS - 4);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS - 4} ${RADIUS - 4} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

const AnimatedView = Animated.View;

type Props = { rotate: Animated.AnimatedInterpolation<string> };

export function SpinWheelGraphic({ rotate }: Props) {
  const theme = useTheme();
  const segments = getSpinSegments();

  return (
    <View style={{ width: SIZE, height: SIZE + 30, alignItems: 'center', justifyContent: 'center' }}>
      {/* İbre — sabit, çark döner */}
      <Svg width={30} height={26} style={{ marginBottom: -6, zIndex: 2 }}>
        {/* İbre dış gölge / gövde */}
        <Path d="M 15 25 L 3 2 L 27 2 Z" fill="#000" fillOpacity={0.3} />
        {/* Ana altın ibre */}
        <Path d="M 15 23 L 4 3 L 26 3 Z" fill={theme.accent} />
        {/* İç aydınlık efekti */}
        <Path d="M 15 20 L 7 5 L 23 5 Z" fill="#ffffff" fillOpacity={0.25} />
      </Svg>

      <AnimatedView
        style={{
          width: SIZE,
          height: SIZE,
          transform: [{ rotate }],
          shadowColor: theme.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 5,
        }}
      >
        <Svg width={SIZE} height={SIZE}>
          {/* Dış Altın Parlayan Çerçeve */}
          <Circle cx={CENTER} cy={CENTER} r={RADIUS - 2} fill={theme.bgElevated} stroke={theme.accent} strokeWidth={3} />
          {/* İç ince ayraç halkası */}
          <Circle cx={CENTER} cy={CENTER} r={RADIUS - 6} fill="transparent" stroke={theme.border} strokeWidth={1} />
          
          {segments.map((segment, idx) => {
            const mid = (segment.startAngle + segment.endAngle) / 2;
            const labelPos = polarToCartesian(mid, RADIUS * 0.64);
            const isPrize = segment.days > 0;
            
            // Zengin altın tonları
            const prizeColors = ['#b88a06', '#cda10d', '#e2b714', '#f3d047'];
            const fillColor = isPrize ? prizeColors[idx % prizeColors.length] : theme.bgCard;
            
            return (
              <G key={segment.label + idx}>
                <Path
                  d={segmentPath(segment.startAngle, segment.endAngle)}
                  fill={fillColor}
                  fillOpacity={isPrize ? 0.45 : 0.85}
                  stroke={theme.border}
                  strokeWidth={1}
                />
                {/* Değer Yazısı */}
                <SvgText
                  x={labelPos.x}
                  y={labelPos.y}
                  fill={isPrize ? theme.accent : theme.textMuted}
                  fontSize={isPrize ? 13 : 11}
                  fontWeight="900"
                  textAnchor="middle"
                  transform={`rotate(${mid} ${labelPos.x} ${labelPos.y})`}
                >
                  {isPrize ? `${segment.days}g` : 'Pas'}
                </SvgText>
              </G>
            );
          })}

          {/* 3D Göbek Halkası */}
          <Circle cx={CENTER} cy={CENTER} r={22} fill={theme.bgCard} stroke={theme.accent} strokeWidth={2.5} />
          <Circle cx={CENTER} cy={CENTER} r={14} fill={theme.accent} />
          <Circle cx={CENTER} cy={CENTER} r={6} fill="#ffffff" fillOpacity={0.4} />
        </Svg>
      </AnimatedView>
    </View>
  );
}
