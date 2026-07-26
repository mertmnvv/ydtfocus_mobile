import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase';

// Çark/Hediye/Abonelik ile ilgili role/premiumUntil yazımları artık
// TAMAMEN sunucu tarafında (ydtfocusv2/functions/index.js) —
// istemci bu alanları hiçbir zaman doğrudan yazamıyor (bkz.
// ydtfocusv2/firestore.rules, TODO.md "Güvenlik notu"). Bu dosya o
// callable fonksiyonların istemci sarmalayıcıları.

export type SpinResult = { days: number; label: string };

export async function spinWheel(mode: 'free' | 'ad'): Promise<SpinResult> {
  const call = httpsCallable<{ mode: 'free' | 'ad' }, SpinResult>(functions, 'spinWheel');
  const result = await call({ mode });
  return result.data;
}

export type ClaimWheelPrizeResult = { ok: true; giftCode?: string };

export async function claimWheelPrize(action: 'self' | 'gift'): Promise<ClaimWheelPrizeResult> {
  const call = httpsCallable<{ action: 'self' | 'gift' }, ClaimWheelPrizeResult>(functions, 'claimWheelPrize');
  const result = await call({ action });
  return result.data;
}

export type RedeemGiftFunctionResult = { days: number };

export async function redeemGiftCodeViaFunction(code: string): Promise<RedeemGiftFunctionResult> {
  const call = httpsCallable<{ code: string }, RedeemGiftFunctionResult>(functions, 'redeemGiftCode');
  const result = await call({ code });
  return result.data;
}
