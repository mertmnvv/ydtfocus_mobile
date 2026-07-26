import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { updateFcmToken } from '@/lib/firestore';

// Uygulama önplandayken de bildirim banner'ı gösterilsin — expo-notifications
// varsayılanı foreground'da sessiz kalmaktır.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Web'in useFcmToken.js'iyle aynı hedef: users/{uid}.fcmToken alanına
// bu cihazın push token'ını yazmak — web'in cron tabanlı hatırlatma
// gönderimi (ydtfocusv2/src/app/api/notifications/remind/route.js) bu
// alanı doğrudan `adminMessaging.sendEach({ token: userData.fcmToken })`
// ile okuyor. Emülatörde/fiziksel olmayan cihazda push token alınamaz —
// Device.isDevice kontrolü bunu sessizce atlar (hata değil, beklenen durum).
export async function registerForPushNotifications(uid: string) {
  if (!Device.isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    // Web'in gönderim akışı ham FCM token'ı ile çalışıyor (Expo push
    // servisi değil) — bu yüzden getExpoPushTokenAsync değil,
    // getDevicePushTokenAsync (Android'de gerçek FCM registration token'ı
    // döner) kullanılıyor.
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (token) await updateFcmToken(uid, token);
  } catch {
    // Token alınamadı (native modül linklenmemiş/izin reddedilmiş vb.) —
    // bildirim opsiyonel bir özellik, uygulamanın geri kalanını bloklamaz.
  }
}
