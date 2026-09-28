/* 試験機能（フィーチャーフラグ）
 * 管理ページ（admin.html）から端末ごとにオン／オフする。初期値はすべてオフで、
 * 一般のプレイヤーには試験機能が見えない（オフのときは origin の main と同じ見た目・動き）。
 * 今後の試験のために仕組みは残している（いまは試験中の機能は無い）。 */
import { store } from './storage';

export type Feature = { readonly id: string; readonly name: string; readonly desc: string };

/** 試験中の機能の一覧（例：{ id: 'xxx', name: '機能名', desc: '説明' }） */
export const FEATURES: readonly Feature[] = [];

export type FeatureId = Feature['id'];

export const isFeatureId = (s: string | undefined): s is FeatureId => FEATURES.some(f => f.id === s);

/** localStorage のキー */
export const featureKey = (id: FeatureId): string => `mofuru-feature-${id}`;

/** 保存値 → オン／オフ（'1' のときだけオン。未設定・不明な値はオフ） */
export const parseFeature = (s: string): boolean => s === '1';

/** 試験機能がこの端末でオンか（毎回 localStorage から読むので、管理ページでの変更がすぐ反映される） */
export function isFeatureOn(id: FeatureId): boolean { return parseFeature(store.get(featureKey(id))); }

export function setFeature(id: FeatureId, on: boolean): void { store.set(featureKey(id), on ? '1' : '0'); }

/** 正式公開して試験機能ではなくなったもののキー（効果音・BGM は正式機能になった）。残っていても使わない */
export const RETIRED_FEATURE_KEYS = ['mofuru-feature-sound', 'mofuru-feature-bgm'] as const;

/** 使わなくなった試験機能のキーを端末から消す（無くても・消せなくても何もしない） */
export function clearRetiredFeatures(): void { RETIRED_FEATURE_KEYS.forEach(k => store.del(k)); }

/** data-feature="<id>" の要素を、その試験機能がオンのときだけ表示する */
export function applyFeatureVisibility(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-feature]').forEach(el => {
    const id = el.dataset.feature;
    el.hidden = !(isFeatureId(id) && isFeatureOn(id));
  });
}
