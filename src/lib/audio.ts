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

// Bir seferde tek ses dosyası çalınır — yeni çağrı öncekini durdurup siler.
let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;
let activeFileUri: string | null = null;

export async function playTtsAudio(buffer: ArrayBuffer) {
  activePlayer?.remove();
  activePlayer = null;
  if (activeFileUri) {
    await deleteAsync(activeFileUri, { idempotent: true }).catch(() => {});
    activeFileUri = null;
  }

  const fileUri = `${cacheDirectory}tts-${Date.now()}.mp3`;
  await writeAsStringAsync(fileUri, arrayBufferToBase64(buffer), {
    encoding: EncodingType.Base64,
  });
  activeFileUri = fileUri;

  const player = createAudioPlayer({ uri: fileUri });
  activePlayer = player;
  player.play();
}

export function stopTtsAudio() {
  activePlayer?.remove();
  activePlayer = null;
  if (activeFileUri) {
    deleteAsync(activeFileUri, { idempotent: true }).catch(() => {});
    activeFileUri = null;
  }
}
