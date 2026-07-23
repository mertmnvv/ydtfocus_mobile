// react-native-google-mobile-ads, native bir Turbo modülü
// (RNGoogleMobileAdsModule) gerektirir — dev client'ın native olarak
// yeniden derlenmesi lazım (bkz. TODO.md "Hediye Premium + Çark
// Çevir"). Bu yüzden paket üst seviyede DEĞİL, showRewardedAd
// çağrıldığında dynamic import ile yükleniyor — aksi halde modül
// linklenmemiş bir cihazda uygulama açılışında "TurboModuleRegistry
// getEnforcing: RNGoogleMobileAdsModule could not be found" hatasıyla
// tüm uygulama çöküyordu (spin-wheel-modal.tsx'in top-level import'u
// üzerinden).
async function loadAds() {
  return import('react-native-google-mobile-ads');
}

// Çark'ta ekstra çevirme hakkı için rewarded ad gösterir, kullanıcı
// ödülü kazanırsa true döner (reklamı yarıda kapatırsa false, native
// modül henüz linklenmemişse de false döner).
export async function showRewardedAd(): Promise<boolean> {
  let mod: Awaited<ReturnType<typeof loadAds>>;
  try {
    mod = await loadAds();
  } catch {
    return false;
  }
  const { AdEventType, RewardedAd, RewardedAdEventType, TestIds } = mod;

  // EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID doldurulana kadar Google'ın test
  // reklam birimi kullanılır — gerçek envanter olmadan da geliştirme/test
  // akışını kırmadan çalışır.
  const adUnitId = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID || TestIds.REWARDED;

  return new Promise((resolve) => {
    let rewarded: ReturnType<typeof RewardedAd.createForAdRequest>;
    try {
      rewarded = RewardedAd.createForAdRequest(adUnitId);
    } catch {
      resolve(false);
      return;
    }
    let earned = false;

    const unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewarded.show();
    });
    const unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    const unsubscribeClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
      resolve(earned);
    });
    const unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
      resolve(false);
    });

    rewarded.load();
  });
}
