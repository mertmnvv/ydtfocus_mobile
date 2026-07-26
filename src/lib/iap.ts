import type { Product, ProductSubscription, ProductSubscriptionAndroid, Purchase } from 'react-native-iap';

// react-native-iap, react-native-nitro-modules (native Turbo/Fabric modülü)
// gerektirir — bu, dev client'ın native olarak yeniden derlenmesini
// gerektirir (bkz. TODO.md "Hediye Premium + Çark Çevir"). Yeniden
// derlenmemiş bir cihaz/emulator'de bu modül import edilirse anında
// "Failed to get NitroModules" hatasıyla TÜM uygulama açılışta çöker.
// Bu yüzden paket, gerçekten satın alma tetiklenene kadar import
// EDİLMİYOR (top-level static import yerine fonksiyon içinde dynamic
// `await import(...)`) — böylece Reading/Rozetler/Profil gibi diğer
// ekranlar, hatta gift.tsx'in kendisi bile, dev client yeniden
// derlenmeden önce sorunsuz çalışmaya devam eder.
async function loadIap() {
  return import('react-native-iap');
}

// Play Console'da bu ID'lerle tanımlanmalı (ayrı manuel iş, bkz. TODO.md).
export const GIFT_PRODUCT_IDS = ['gift_premium_7d', 'gift_premium_30d', 'gift_premium_365d'] as const;
export type GiftProductId = (typeof GIFT_PRODUCT_IDS)[number];

export const GIFT_PRODUCT_DAYS: Record<GiftProductId, number> = {
  gift_premium_7d: 7,
  gift_premium_30d: 30,
  gift_premium_365d: 365,
};

export async function initIap() {
  const { initConnection } = await loadIap();
  await initConnection();
}

export async function getGiftProducts(): Promise<Product[]> {
  const { fetchProducts } = await loadIap();
  const result = await fetchProducts({ skus: [...GIFT_PRODUCT_IDS], type: 'in-app' });
  return (result as Product[]) ?? [];
}

// Satın alma tamamlandığında purchaseUpdatedListener'dan gelen purchase
// nesnesini (purchaseToken) web'e doğrulatmak çağıranın işi —
// bkz. src/lib/api.ts verifyGiftPurchase ve TODO.md "Hediye/Çark" bölümü.
export async function purchaseGift(productId: GiftProductId) {
  const { requestPurchase } = await loadIap();
  return requestPurchase({
    type: 'in-app',
    request: { google: { skus: [productId] } },
  });
}

export async function onPurchaseUpdated(callback: (purchase: Purchase) => void) {
  const { purchaseUpdatedListener } = await loadIap();
  return purchaseUpdatedListener(callback);
}

export async function onPurchaseError(callback: (error: unknown) => void) {
  const { purchaseErrorListener } = await loadIap();
  return purchaseErrorListener(callback);
}

export async function finishGiftTransaction(...args: Parameters<typeof import('react-native-iap').finishTransaction>) {
  const { finishTransaction } = await loadIap();
  return finishTransaction(...args);
}

// ── Premium aboneliği (PayTR'nin mobil karşılığı yerine doğrudan Play
// Store) — Play Store'a dağıtılan bir Android uygulamasında dijital
// abonelik SADECE Google Play Billing üzerinden satılabilir (mağaza
// politikası), bu yüzden PayTR mobilde kullanılamaz; web'de PayTR
// kalmaya devam ediyor, mobil sadece Play Billing kullanır. Play
// Console'da bu ID'lerle abonelik ürünü tanımlanmalı (ayrı manuel iş).
export const PREMIUM_PRODUCT_IDS = ['premium_monthly', 'premium_yearly'] as const;
export type PremiumProductId = (typeof PREMIUM_PRODUCT_IDS)[number];

export async function getPremiumSubscriptions(): Promise<ProductSubscription[]> {
  const { fetchProducts } = await loadIap();
  const result = await fetchProducts({ skus: [...PREMIUM_PRODUCT_IDS], type: 'subs' });
  return (result as ProductSubscription[]) ?? [];
}

// Android abonelik satın alması icin offerToken gerekiyor - urun
// listesinden ilk (temel) teklifi aliyoruz. Web'in aksine mobilde
// birden fazla fiyatlandirma teklifi/kampanya su an desteklenmiyor.
export async function purchasePremium(product: ProductSubscription) {
  const { requestPurchase } = await loadIap();
  const androidProduct = product as ProductSubscriptionAndroid;
  const offerToken = androidProduct.subscriptionOfferDetailsAndroid?.[0]?.offerToken;
  return requestPurchase({
    type: 'subs',
    request: {
      google: {
        skus: [product.id],
        ...(offerToken ? { subscriptionOffers: [{ sku: product.id, offerToken }] } : {}),
      },
    },
  });
}

export async function finishPremiumTransaction(
  ...args: Parameters<typeof import('react-native-iap').finishTransaction>
) {
  const { finishTransaction } = await loadIap();
  return finishTransaction(...args);
}
