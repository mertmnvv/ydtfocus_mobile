import { useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Share, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { SpinWheelGraphic } from '@/components/spin-wheel-graphic';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { landingAngleForDays } from '@/constants/spin-wheel';
import { useAuth } from '@/context/auth-context';
import { showRewardedAd } from '@/lib/ads';
import { canClaimAdSpin, canClaimFreeSpin, type WheelState } from '@/lib/firestore';
import { claimWheelPrize, spinWheel, type SpinResult } from '@/lib/functions';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  wheelState: WheelState;
  onWheelStateChange: () => void;
};

export function SpinWheelModal({ visible, onClose, wheelState, onWheelStateChange }: Props) {
  const theme = useTheme();
  const { user } = useAuth();
  const [spinning, setSpinning] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [prize, setPrize] = useState<SpinResult | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const [claimState, setClaimState] = useState<'idle' | 'saving' | 'gifted'>('idle');
  const [giftCode, setGiftCode] = useState<string | null>(null);
  const [reveal] = useState(() => new Animated.Value(0));
  const [rotationAnim] = useState(() => new Animated.Value(0));
  const currentRotationRef = useRef(0);

  const rotate = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '1deg'],
    extrapolate: 'extend',
  });

  const freeAvailable = canClaimFreeSpin(wheelState);
  const adAvailable = canClaimAdSpin(wheelState);

  function resetForNextSpin() {
    setPrize(null);
    setResultVisible(false);
    setGiftCode(null);
    setClaimState('idle');
    reveal.setValue(0);
  }

  async function runSpin(kind: 'free' | 'ad') {
    if (!user || spinning) return;
    setSpinning(true);
    try {
      // Hak kontrolü VE ödül seçimi artık spinWheel Cloud Function'ında
      // (sunucu tarafında) — client sadece sonucu alıp animasyonu
      // oynatıyor, ödülü kendi belirleyemiyor (bkz. TODO.md "Güvenlik notu").
      const result = await spinWheel(kind);
      onWheelStateChange();

      const landingAngle = landingAngleForDays(result.days);
      // İbre 12 yönünde sabit — çarkın mutlak dönüşü (mod 360) landingAngle'ı
      // ibrenin altına getirecek şekilde hesaplanıyor, üzerine 4-6 tam tur
      // ekleniyor (görsel etki için), yön her zaman ileri (negatif delta yok).
      const spins = 4 + Math.floor(Math.random() * 3);
      const currentMod = ((currentRotationRef.current % 360) + 360) % 360;
      const delta = (360 - landingAngle - currentMod + 360) % 360;
      const target = currentRotationRef.current + spins * 360 + delta;
      currentRotationRef.current = target;

      await new Promise<void>((resolve) => {
        Animated.timing(rotationAnim, {
          toValue: target,
          duration: 3000,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => resolve());
      });

      setPrize(result);
      setResultVisible(true);
      reveal.setValue(0);
      Animated.timing(reveal, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    } catch {
      // Hak yoksa (failed-precondition) sessizce kapat — üstteki
      // freeAvailable/adAvailable kontrolleri zaten butonu devre dışı
      // bırakıyor, buraya normalde düşülmemeli.
    } finally {
      setSpinning(false);
      onWheelStateChange();
    }
  }

  async function handleFreeSpin() {
    await runSpin('free');
  }

  async function handleAdSpin() {
    if (!user || adLoading) return;
    setAdLoading(true);
    try {
      const earned = await showRewardedAd();
      if (earned) await runSpin('ad');
    } finally {
      setAdLoading(false);
    }
  }

  async function handleUseForSelf() {
    if (!user || !prize || prize.days === 0) return;
    setClaimState('saving');
    try {
      await claimWheelPrize('self');
      setClaimState('idle');
      resetForNextSpin();
      onClose();
    } catch {
      setClaimState('idle');
    }
  }

  async function handleGiftToFriend() {
    if (!user || !prize || prize.days === 0) return;
    setClaimState('saving');
    try {
      const result = await claimWheelPrize('gift');
      if (!result.giftCode) throw new Error('NO_CODE');
      setGiftCode(result.giftCode);
      setClaimState('gifted');
      await Share.share({
        message: `ydtfocus'ta ${prize.days} günlük premium kazandım ve sana hediye ediyorum! Kod: ${result.giftCode}`,
      });
    } catch {
      setClaimState('idle');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: 'rgba(26, 26, 26, 0.88)',
              borderColor: theme.accent,
              borderWidth: 1.5,
              shadowColor: theme.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 15,
              elevation: 8,
            },
          ]}
        >
          <ThemedText type="subtitle" themeColor="accent" style={styles.title}>
            Çark Çevir
          </ThemedText>

          <SpinWheelGraphic rotate={rotate} />

          {!resultVisible && (
            <>
              <ThemedText themeColor="textMuted" style={styles.subtitle}>
                Haftada 1 ücretsiz çevirme hakkın var. 1/3/7 gün premium kazanabilirsin.
              </ThemedText>

              <Pressable
                onPress={handleFreeSpin}
                disabled={!freeAvailable || spinning}
                style={({ pressed }) => [
                  styles.spinButton,
                  {
                    backgroundColor: theme.accent,
                    opacity: !freeAvailable || spinning ? 0.5 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <ThemedText type="smallBold" themeColor="bg">
                  {spinning ? 'Çevriliyor…' : freeAvailable ? 'Çevir' : 'Bu Haftaki Hakkın Bitti'}
                </ThemedText>
              </Pressable>

              {!freeAvailable && (
                <Pressable
                  onPress={handleAdSpin}
                  disabled={!adAvailable || adLoading || spinning}
                  style={({ pressed }) => [
                    styles.adButton,
                    {
                      borderColor: theme.accent,
                      borderWidth: 1.5,
                      opacity: !adAvailable || adLoading || spinning ? 0.5 : 1,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                  ]}
                >
                  <ThemedText type="smallBold" themeColor="accent">
                    {adLoading
                      ? 'Reklam Yükleniyor…'
                      : adAvailable
                        ? 'Reklam İzle, Ekstra Çevirme Kazan'
                        : 'Bu hafta için ekstra hakların bitti'}
                  </ThemedText>
                </Pressable>
              )}
            </>
          )}

          {resultVisible && prize && (
            <Animated.View style={[styles.resultBox, { opacity: reveal, transform: [{ scale: reveal }] }]}>
              {/* Parlayan altın hediye paketi / kupa ikonu */}
              <MaterialCommunityIcons name={prize.days > 0 ? 'gift' : 'emoticon-sad-outline'} size={48} color={theme.accent} style={{ marginBottom: Spacing.one }} />
              
              <ThemedText type="title" themeColor="accent" style={styles.resultLabel}>
                {prize.label}
              </ThemedText>

              {prize.days === 0 ? (
                <Pressable
                  onPress={resetForNextSpin}
                  style={({ pressed }) => [
                    styles.spinButton,
                    {
                      backgroundColor: theme.accent,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    },
                  ]}
                >
                  <ThemedText type="smallBold" themeColor="bg">
                    Tamam
                  </ThemedText>
                </Pressable>
              ) : claimState === 'gifted' ? (
                <View style={styles.giftedBox}>
                  <ThemedText themeColor="textMuted" style={styles.subtitle}>
                    Hediye kodu oluşturuldu ve paylaşıldı:
                  </ThemedText>
                  <ThemedText type="title" themeColor="accent" style={{ marginVertical: Spacing.two, letterSpacing: 1.5, fontWeight: '900' }}>
                    {giftCode}
                  </ThemedText>
                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => [
                      styles.spinButton,
                      {
                        backgroundColor: theme.accent,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor="bg">
                      Kapat
                    </ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.choiceRow}>
                  <Pressable
                    onPress={handleUseForSelf}
                    disabled={claimState === 'saving'}
                    style={({ pressed }) => [
                      styles.choiceButton,
                      {
                        backgroundColor: theme.accent,
                        opacity: claimState === 'saving' ? 0.6 : 1,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor="bg">
                      {claimState === 'saving' ? 'Yükleniyor…' : 'Kendime Kullan'}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={handleGiftToFriend}
                    disabled={claimState === 'saving'}
                    style={({ pressed }) => [
                      styles.choiceButton,
                      {
                        borderWidth: 1.5,
                        borderColor: theme.accent,
                        backgroundColor: 'transparent',
                        opacity: claimState === 'saving' ? 0.6 : 1,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      },
                    ]}
                  >
                    <ThemedText type="smallBold" themeColor="accent">
                      {claimState === 'saving' ? 'Oluşturuluyor…' : 'Arkadaşıma Hediye'}
                    </ThemedText>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  subtitle: { textAlign: 'center' },
  spinButton: {
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    width: '100%',
  },
  adButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    width: '100%',
  },
  resultBox: { alignItems: 'center', gap: Spacing.three, width: '100%' },
  resultLabel: { fontSize: 22, textAlign: 'center' },
  choiceRow: { flexDirection: 'row', gap: Spacing.two, width: '100%' },
  choiceButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  giftedBox: { alignItems: 'center', gap: Spacing.two },
});
