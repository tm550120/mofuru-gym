/* この端末の設定（進行スピード・CPU対戦の手番） */
import type { CpuOrder } from '../game/rules';
import { store } from '../storage';

export type Speed = 'slow' | 'normal' | 'fast';
/** 進行スピード：CPUの待ち時間などに掛ける倍率 */
export const SPEEDS: Record<Speed, number> = { slow: 1.7, normal: 1, fast: .5 };
const SPEED_KEY = 'mofuru-speed', ORDER_KEY = 'mofuru-order';

const isSpeed = (s: string): s is Speed => Object.prototype.hasOwnProperty.call(SPEEDS, s);
const isOrder = (s: string): s is CpuOrder => ['1', '2', '3', 'r'].includes(s);

export const settings: { speed: Speed; cpuOrder: CpuOrder } = {
  speed: (() => { const s = store.get(SPEED_KEY); return isSpeed(s) ? s : 'normal'; })(),
  cpuOrder: (() => { const s = store.get(ORDER_KEY); return isOrder(s) ? s : '1'; })(),
};

export function setSpeed(s: string | undefined): void { if (!s || !isSpeed(s)) return; settings.speed = s; store.set(SPEED_KEY, s); }
export function setCpuOrder(o: string | undefined): void { if (!o || !isOrder(o)) return; settings.cpuOrder = o; store.set(ORDER_KEY, o); }

/** 待ち時間 ms を進行スピードに合わせる */
export const D = (ms: number): number => Math.round(ms * SPEEDS[settings.speed]);
