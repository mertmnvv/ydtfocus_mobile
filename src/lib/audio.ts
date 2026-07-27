import { createAudioPlayer } from 'expo-audio';
import { cacheDirectory, deleteAsync, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';

// btoa/Buffer RN'de garanti değil (Hermes'te yok) — TTS'ten gelen
// ArrayBuffer'ı elle base64'e çeviriyoruz.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    result += BASE64_CHARS[b1 >> 2];
    result += BASE64_CHARS[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += b2 !== undefined ? BASE64_CHARS[((b2 & 0x0f) << 2) | (b3 >> 6)] : '=';
    result += b3 !== undefined ? BASE64_CHARS[b3 & 0x3f] : '=';
  }
  return result;
}

export type TtsPlaybackHandle = {
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

export type TtsPlaybackOptions = {
  // Web'deki spokenWordIndex mantığının mobil karşılığı — cümle bittiğinde
  // otomatik sıradakine geçebilmek için oku ekranı bu event'lere göre
  // progress/aktif kelime index'ini hesaplıyor.
  onProgress?: (currentTime: number, duration: number) => void;
  onEnd?: () => void;
};

let prepareCounter = 0;

// Ses dosyasını sadece diske yazar, çalmaz ve aktif player'a dokunmaz —
// Okuma ekranı bir sonraki cümlenin sesini şu anki cümle çalınırken arka
// planda bu fonksiyonla hazırlayıp playPreparedTtsAudio ile anında
// oynatabiliyor (cümle geçişindeki network gecikmesini ortadan kaldırır).
export async function prepareTtsFile(buffer: ArrayBuffer): Promise<string> {
  prepareCounter += 1;
  const fileUri = `${cacheDirectory}tts-${Date.now()}-${prepareCounter}.mp3`;
  await writeAsStringAsync(fileUri, arrayBufferToBase64(buffer), {
    encoding: EncodingType.Base64,
  });
  return fileUri;
}

// Pasaj (cümle-cümle okuma) ve kelime-lookup "Dinle" sesleri BİRBİRİNDEN
// BAĞIMSIZ birer "slot" (aktif player + dosya) üzerinden yönetiliyor. Aynı
// slotu paylaşsalardı, kelime sesi çalınırken pasaj player'ı sessizce
// remove() edilip dosyası silinirdi — bu hem "Devam Et" ile devam
// edilemeyen bozuk bir player bırakır hem de (bir handle'ın stop()'u
// modül-seviyesindeki paylaşılan tek slotu hedef aldığından) yanlış
// player'ın durdurulup diğerinin çalmaya devam etmesine, yani iki sesin
// üst üste binmesine yol açardı.
function createPlaybackSlot() {
  let slotPlayer: ReturnType<typeof createAudioPlayer> | null = null;
  let slotFileUri: string | null = null;

  async function play(fileUri: string, options?: TtsPlaybackOptions): Promise<TtsPlaybackHandle> {
    const previousFileUri = slotFileUri;
    slotPlayer?.remove();
    slotPlayer = null;
    slotFileUri = fileUri;
    if (previousFileUri && previousFileUri !== fileUri) {
      await deleteAsync(previousFileUri, { idempotent: true }).catch(() => {});
    }

    const player = createAudioPlayer({ uri: fileUri });
    slotPlayer = player;

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      options?.onProgress?.(status.currentTime, status.duration);
      if (status.didJustFinish) {
        subscription.remove();
        options?.onEnd?.();
      }
    });

    player.play();

    // stop() SADECE bu player/dosyayı kapatır, slotPlayer/slotFileUri'yi
    // sadece HÂLÂ kendisiyse temizler. Aksi halde: bu handle "bayat" (stale)
    // hale gelip (ör. Okuma ekranındaki token kontrolü nedeniyle) stop()
    // çağrıldığında, aradan slota YENİ bir player girmiş olabilir — o yeni
    // player'ı yanlışlıkla durdurup kendi (asıl çalmaya devam eden)
    // player'ını hiç durdurmamış olurduk.
    return {
      pause: () => player.pause(),
      resume: () => player.play(),
      stop: () => {
        subscription.remove();
        player.remove();
        deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        if (slotPlayer === player) {
          slotPlayer = null;
          slotFileUri = null;
        }
      },
    };
  }

  function stop() {
    slotPlayer?.remove();
    slotPlayer = null;
    if (slotFileUri) {
      deleteAsync(slotFileUri, { idempotent: true }).catch(() => {});
      slotFileUri = null;
    }
  }

  function discard(fileUri: string) {
    if (fileUri === slotFileUri) return;
    deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  }

  return { play, stop, discard };
}

const passageSlot = createPlaybackSlot();
const adhocSlot = createPlaybackSlot();

// Diskteki (prepareTtsFile ile yazılmış) bir ses dosyasını pasaj slotunda
// çalar — Okuma ekranındaki cümle-cümle TTS akışı bunu kullanır.
export function playPreparedTtsAudio(fileUri: string, options?: TtsPlaybackOptions): Promise<TtsPlaybackHandle> {
  return passageSlot.play(fileUri, options);
}

// Tekil/anlık TTS (kelime lookup modalındaki "Dinle" gibi) — pasaj
// okumasından bağımsız bir slotta çalar, birbirlerini durdurmazlar.
export async function playTtsAudio(buffer: ArrayBuffer, options?: TtsPlaybackOptions): Promise<TtsPlaybackHandle> {
  const fileUri = await prepareTtsFile(buffer);
  return adhocSlot.play(fileUri, options);
}

// Kullanılmadan iptal edilen bir prefetch dosyasını (ör. kullanıcı okumayı
// durdurduğunda) diskten temizler — aktif çalınan (pasaj) dosyayla aynıysa
// dokunmaz.
export function discardPreparedTtsFile(fileUri: string) {
  passageSlot.discard(fileUri);
}

// Pasaj okumasını durdurur — kelime lookup'ın adhoc sesini etkilemez.
export function stopTtsAudio() {
  passageSlot.stop();
}
