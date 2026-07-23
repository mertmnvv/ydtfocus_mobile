import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { verifyGiftPurchase } from '@/lib/api';
import {
  GIFT_PRODUCT_DAYS,
  finishGiftTransaction,
  initIap,
  onPurchaseError,
  onPurchaseUpdated,
  purchaseGift,
  type GiftProductId,
} from '@/lib/iap';
import { redeemGiftCode } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

const GIFT_TIERS: { id: GiftProductId; label: string }[] = [
  { id: 'gift_premium_7d', label: '7 Gün' },
  { id: 'gift_premium_30d', label: '30 Gün' },
  { id: 'gift_premium_365d', label: '1 Yıl' },
];

export default function GiftScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [purchaseNotice, setPurchaseNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [purchasingId, setPurchasingId] = useState<GiftProductId | null>(null);
  const [purchaseGiftCode, setPurchaseGiftCode] = useState<string | null>(null);

  // react-native-iap native modülü sadece dev client yeniden derlendikten
  // sonra çalışır (bkz. TODO.md "Hediye Premium + Çark Çevir") — bu
  // yüzden listener kaydı da try/catch içinde, native modül yoksa ekranın
  // geri kalanı (hediye kodu kullanma) etkilenmeden çalışmaya devam eder.
  useEffect(() => {
    let updatedSub: { remove: () => void } | undefined;
    let errorSub: { remove: () => void } | undefined;

    (async () => {
      try {
        await initIap();
        updatedSub = await onPurchaseUpdated(async (purchase) => {
          const productId = purchase.productId as GiftProductId;
          try {
            const result = await verifyGiftPurchase(purchase.purchaseToken ?? '', productId);
            await finishGiftTransaction({ purchase, isConsumable: true });
            setPurchaseGiftCode(result.giftCode);
            setPurchaseNotice({ text: `${result.days} günlük hediye kodu oluşturuldu, paylaşabilirsin.`, ok: true });
            await Share.share({
              message: `ydtfocus'ta sana ${result.days} günlük premium hediye ettim! Kod: ${result.giftCode}`,
            });
          } catch {
            setPurchaseNotice({ text: 'Satın alma doğrulanamadı, lütfen tekrar dene.', ok: false });
          } finally {
            setPurchasingId(null);
          }
        });
        errorSub = await onPurchaseError(() => {
          setPurchasingId(null);
        });
      } catch {
        // Native modül henüz linklenmemiş (dev client rebuild bekleniyor) —
        // satın alma butonuna basılınca kullanıcıya bilgi veriliyor, sessizce yutulmuyor.
      }
    })();

    return () => {
      updatedSub?.remove();
      errorSub?.remove();
    };
  }, []);

  async function handleRedeem() {
    if (!user || !code.trim()) return;
    setRedeeming(true);
    setRedeemMessage(null);
    try {
      const result = await redeemGiftCode(user.uid, code);
      if (result.ok) {
        setRedeemMessage({ text: `${result.days} gün premium hesabına eklendi!`, ok: true });
        setCode('');
      } else {
        setRedeemMessage({ text: result.error, ok: false });
      }
    } finally {
      setRedeeming(false);
    }
  }

  // Satın alma sonucu purchaseUpdatedListener'a (yukarıdaki effect) düşer,
  // burası sadece akışı başlatır. ydtfocusv2'de doğrulama route'u
  // (/api/play-billing/verify-gift) henüz olmadığından (bkz. TODO.md)
  // verifyGiftPurchase şu an başarısız dönebilir — bu da sessizce
  // yutulmuyor, kullanıcıya "doğrulanamadı" mesajı gösteriliyor.
  async function handlePurchaseGift(productId: GiftProductId) {
    setPurchaseNotice(null);
    setPurchaseGiftCode(null);
    setPurchasingId(productId);
    try {
      await purchaseGift(productId);
    } catch {
      setPurchaseNotice({ text: 'Satın alma başlatılamadı — bu özellik dev client yeniden derlenene kadar aktif olmayabilir.', ok: false });
      setPurchasingId(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="smallBold" themeColor="accent">
              ‹ Geri
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={styles.title}>
            Arkadaşına Hediye Et
          </ThemedText>
        </View>

        <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            Satın Al ve Hediye Et
          </ThemedText>
          <View style={styles.tierRow}>
            {GIFT_TIERS.map((tier) => (
              <Pressable
                key={tier.id}
                onPress={() => handlePurchaseGift(tier.id)}
                disabled={purchasingId !== null}
                style={[
                  styles.tierButton,
                  { borderColor: theme.border, backgroundColor: theme.bgElevated, opacity: purchasingId !== null ? 0.6 : 1 },
                ]}
              >
                {purchasingId === tier.id ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <>
                    <ThemedText type="smallBold">{tier.label}</ThemedText>
                    <ThemedText themeColor="textMuted" type="small">
                      {GIFT_PRODUCT_DAYS[tier.id]} gün premium
                    </ThemedText>
                  </>
                )}
              </Pressable>
            ))}
          </View>
          {purchaseNotice && (
            <ThemedText themeColor={purchaseNotice.ok ? 'accent' : 'error'} type="small" style={styles.notice}>
              {purchaseNotice.text}
            </ThemedText>
          )}
          {purchaseGiftCode && (
            <ThemedText type="smallBold" themeColor="accent" style={styles.notice}>
              Kod: {purchaseGiftCode}
            </ThemedText>
          )}
        </ThemedView>

        <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" themeColor="textMuted" style={styles.sectionTitle}>
            Hediye Kullan
          </ThemedText>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Hediye kodunu gir"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.border }]}
          />

          {redeemMessage && (
            <ThemedText themeColor={redeemMessage.ok ? 'accent' : 'error'} type="small" style={styles.notice}>
              {redeemMessage.text}
            </ThemedText>
          )}

          <Pressable
            onPress={handleRedeem}
            disabled={redeeming || !code.trim()}
            style={[
              styles.redeemButton,
              { backgroundColor: theme.accent, opacity: redeeming || !code.trim() ? 0.6 : 1 },
            ]}
          >
            {redeeming ? (
              <ActivityIndicator color={theme.bg} />
            ) : (
              <ThemedText type="smallBold" themeColor="bg">
                Kullan
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  backButton: { paddingVertical: Spacing.one },
  title: { fontWeight: '800' },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: { marginBottom: Spacing.half },
  tierRow: { flexDirection: 'row', gap: Spacing.two },
  tierButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    gap: Spacing.half,
  },
  notice: { marginTop: Spacing.one },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  redeemButton: {
    marginTop: Spacing.one,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
});
