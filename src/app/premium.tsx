import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ProductSubscription } from 'react-native-iap';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { verifyPremiumPurchase } from '@/lib/api';
import {
  finishPremiumTransaction,
  getPremiumSubscriptions,
  initIap,
  onPurchaseError,
  onPurchaseUpdated,
  PREMIUM_PRODUCT_IDS,
  purchasePremium,
} from '@/lib/iap';
import { useTheme } from '@/hooks/use-theme';

const PLAN_LABELS: Record<string, string> = {
  premium_monthly: 'Aylık',
  premium_yearly: 'Yıllık',
};

// Premium'a Yükselt — web'de PayTR ile çalışıyor ama Play Store'a
// dağıtılan bir Android uygulamasında dijital abonelik SADECE Google
// Play Billing üzerinden satılabilir (mağaza politikası); bu yüzden
// PayTR'nin mobil karşılığı yapılmadı, mobilde doğrudan Play Billing
// kullanılıyor (bkz. src/lib/iap.ts, TODO.md).
export default function PremiumScreen() {
  const theme = useTheme();
  const { isPremium } = useAuth();
  const [products, setProducts] = useState<ProductSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let updatedSub: { remove: () => void } | undefined;
    let errorSub: { remove: () => void } | undefined;

    (async () => {
      try {
        await initIap();
        const list = await getPremiumSubscriptions();
        setProducts(list);

        updatedSub = await onPurchaseUpdated(async (purchase) => {
          try {
            const result = await verifyPremiumPurchase(purchase.purchaseToken ?? '', purchase.productId);
            await finishPremiumTransaction({ purchase, isConsumable: false });
            setNotice({
              text: `Premium aktif! ${new Date(result.premiumUntil).toLocaleDateString('tr-TR')} tarihine kadar geçerli.`,
              ok: true,
            });
          } catch {
            setNotice({ text: 'Satın alma doğrulanamadı, lütfen tekrar dene.', ok: false });
          } finally {
            setPurchasingId(null);
          }
        });
        errorSub = await onPurchaseError(() => setPurchasingId(null));
      } catch {
        // Native modül henüz linklenmemiş (dev client rebuild bekleniyor).
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      updatedSub?.remove();
      errorSub?.remove();
    };
  }, []);

  async function handlePurchase(product: ProductSubscription) {
    setNotice(null);
    setPurchasingId(product.id);
    try {
      await purchasePremium(product);
    } catch {
      setNotice({ text: 'Satın alma başlatılamadı — dev client yeniden derlenene kadar aktif olmayabilir.', ok: false });
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
            {"Premium'a Yükselt"}
          </ThemedText>
        </View>

        {isPremium && (
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="smallBold" themeColor="accent">
              Zaten premium üyesin
            </ThemedText>
          </ThemedView>
        )}

        {!isPremium && (
          <ThemedView type="bgCard" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={styles.subtitle}>
              {"Sınırsız AI metin üretimi, reklamsız deneyim ve daha fazlası için premium'a yükselt."}
            </ThemedText>

            {loading && <ActivityIndicator color={theme.accent} style={styles.loader} />}

            {!loading &&
              PREMIUM_PRODUCT_IDS.map((id) => {
                const product = products.find((p) => p.id === id);
                return (
                  <Pressable
                    key={id}
                    onPress={() => product && handlePurchase(product)}
                    disabled={!product || purchasingId !== null}
                    style={[
                      styles.planButton,
                      { borderColor: theme.border, backgroundColor: theme.bgElevated, opacity: purchasingId !== null ? 0.6 : 1 },
                    ]}
                  >
                    {purchasingId === id ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : (
                      <>
                        <ThemedText type="smallBold">{PLAN_LABELS[id] ?? id}</ThemedText>
                        <ThemedText themeColor="textMuted" type="small">
                          {product?.displayPrice ?? (loading ? '' : 'Şu an kullanılamıyor')}
                        </ThemedText>
                      </>
                    )}
                  </Pressable>
                );
              })}

            {notice && (
              <ThemedText themeColor={notice.ok ? 'accent' : 'error'} type="small" style={styles.notice}>
                {notice.text}
              </ThemedText>
            )}
          </ThemedView>
        )}
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
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.four, gap: Spacing.two },
  subtitle: { marginBottom: Spacing.two },
  loader: { marginVertical: Spacing.three },
  planButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    gap: Spacing.half,
  },
  notice: { marginTop: Spacing.one, textAlign: 'center' },
});
