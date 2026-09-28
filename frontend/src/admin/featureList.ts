/* 管理ページ：試験機能の一覧の HTML（DOM に依存しない） */
import type { Feature } from '../features';
import { esc } from '../ui/dom';

export const NO_FEATURES_TEXT = '現在、試験中の機能はありません';

/** 試験機能ごとのオン／オフ切り替え。1つも無ければその旨を出す */
export function featureListHtml(list: readonly Feature[], isOn: (id: string) => boolean): string {
  if (!list.length) return `<p class="ainfo">${NO_FEATURES_TEXT}</p>`;
  return list.map(f => {
    const on = isOn(f.id);
    return `<div class="feat"><b>${esc(f.name)}</b><small>${esc(f.desc)}</small>
      <div class="seg" data-feat="${esc(f.id)}"><button data-on="1" class="${on ? 'sel' : ''}" aria-pressed="${on}">オン</button><button data-on="0" class="${on ? '' : 'sel'}" aria-pressed="${!on}">オフ</button></div></div>`;
  }).join('');
}
