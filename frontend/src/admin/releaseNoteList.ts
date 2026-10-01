/* 管理ページ：リリースノートの HTML（DOM に依存しない）。
 * 1 PR = 1 カード（<details>）。最初はすべて閉じ、同時に開くのは 1 つ（排他は main.ts で補う）。 */
import { esc } from '../ui/dom';
import type { Release } from './releaseNotes';

export const NO_RELEASES_TEXT = 'リリースノートはまだありません';
export const UNRELEASED_LABEL = '次のリリース';
export const PENDING_TEXT = '日付・PR 未定';
/** 同時に 1 つだけ開くための details の name（対応ブラウザではネイティブに排他になる） */
export const RELEASE_GROUP = 'relnote';

const isUnreleased = (r: Release): boolean => r.date === null || r.pr === null;

/** 新しい順：未リリース → 日付の新しい順 → 同じ日なら PR 番号の大きい順 */
export function sortReleases(list: readonly Release[]): Release[] {
  return [...list].sort((a, b) => {
    const ua = isUnreleased(a), ub = isUnreleased(b);
    if (ua !== ub) return ua ? -1 : 1;
    const d = (b.date ?? '').localeCompare(a.date ?? '');
    return d || (b.pr ?? 0) - (a.pr ?? 0);
  });
}

function metaHtml(r: Release): string {
  if (isUnreleased(r)) {
    const known = [r.pr !== null ? `#${r.pr}` : '', r.date ? esc(r.date) : ''].filter(Boolean).join(' ');
    return `<span class="rtag">${UNRELEASED_LABEL}</span><span class="rdate">${known ? `${known}・` : ''}${PENDING_TEXT}</span>`;
  }
  return `<span class="rpr">#${r.pr}</span><span class="rdate">${esc(r.date)}</span>`;
}

/** リリースノートの一覧。新しい順に 1 PR = 1 カードで並べ、すべて閉じた状態で出す */
export function releaseListHtml(list: readonly Release[]): string {
  if (!list.length) return `<p class="ainfo">${NO_RELEASES_TEXT}</p>`;
  return sortReleases(list).map(r => {
    const items = r.changes.map(c => `<li>${esc(c)}</li>`).join('');
    return `<details class="rel${isUnreleased(r) ? ' next' : ''}" name="${RELEASE_GROUP}">`
      + `<summary><span class="rmeta">${metaHtml(r)}</span><b class="rttl">${esc(r.title)}</b></summary>`
      + `<div class="rbody"><ul>${items}</ul></div></details>`;
  }).join('');
}
