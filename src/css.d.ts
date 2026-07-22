// Expo Router'ın web build'i CSS import'larını destekler
// (`global.css`, `*.module.css`), ama bu tip bildirimleri normalde
// `npx expo start` ilk çalıştırıldığında üretilen `expo-env.d.ts`
// içinde gelir. Bu dosya, o adım atlanmışken bile `tsc --noEmit`'in
// temiz geçmesi için aynı ambient module bildirimini elle sağlar.
declare module '*.css';
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}
