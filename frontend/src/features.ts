/* 試験機能（フィーチャーフラグ）
 * 管理ページ（admin.html）から端末ごとにオン／オフする。初期値はすべてオフで、
 * 一般のプレイヤーには試験機能が見えない（オフのときは origin の main と同じ見た目・動き）。 */
import { store } from './storage';

export const FEATURES = [
  { id: 'sound', name: '効果音', desc: 'ジムバトルの効果音（開始・サイコロ・勝ち／負け・観戦）と、そのオン／オフボタン' },
  { id: 'bgm', name: 'BGM', desc: '場面ごとのBGM（タイトル・ゲーム中・ジムバトル）と、そのオン／オフボタン' },
] as const;

export type FeatureId = (typeof FEATURES)[number]['id'];

export const isFeatureId = (s: string | undefined): s is FeatureId => FEATURES.some(f => f.id === s);

/** localStorage のキー */
export const featureKey = (id: FeatureId): string => `mofuru-feature-${id}`;

/** 保存値 → オン／オフ（'1' のときだけオン。未設定・不明な値はオフ） */
export const parseFeature = (s: string): boolean => s === '1';

/** 試験機能がこの端末でオンか（毎回 localStorage から読むので、管理ページでの変更がすぐ反映される） */
export function isFeatureOn(id: FeatureId): boolean { return parseFeature(store.get(featureKey(id))); }

export function setFeature(id: FeatureId, on: boolean): void { store.set(featureKey(id), on ? '1' : '0'); }

/** data-feature="<id>" の要素を、その試験機能がオンのときだけ表示する */
export function applyFeatureVisibility(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-feature]').forEach(el => {
    const id = el.dataset.feature;
    el.hidden = !(isFeatureId(id) && isFeatureOn(id));
  });
}
