import { describe, expect, it } from 'vitest';
import { NO_RELEASES_TEXT, PENDING_TEXT, RELEASE_GROUP, releaseListHtml, sortReleases, UNRELEASED_LABEL } from './releaseNoteList';
import { RELEASES, type Release } from './releaseNotes';

const rel = (date: string | null, pr: number | null, title = `t${pr ?? 'x'}`): Release => ({ date, pr, title, changes: ['変更'] });

describe('sortReleases（新しい順）', () => {
  type args = { list: Release[] };
  type expected = { titles: string[] };
  const tests: Record<string, { args: args; expected: expected }> = {
    'success: 未リリースが先頭、続いて日付の新しい順': {
      args: { list: [rel('2026-09-26', 1), rel(null, null, 'next'), rel('2026-10-01', 9)] },
      expected: { titles: ['next', 't9', 't1'] },
    },
    'success: 同じ日は PR 番号の大きい順': {
      args: { list: [rel('2026-09-28', 6), rel('2026-09-28', 8), rel('2026-09-28', 7)] },
      expected: { titles: ['t8', 't7', 't6'] },
    },
    'success: 空なら空': { args: { list: [] }, expected: { titles: [] } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(sortReleases(tt.args.list).map(r => r.title)).toEqual(tt.expected.titles); });
  }
});

describe('releaseListHtml（管理ページのリリースノート）', () => {
  type args = { list: Release[] };
  type expected = { contains: string[]; notContains: string[]; cards: number };
  const tests: Record<string, { args: args; expected: expected }> = {
    'success: リリース済みは PR 番号・日付・見出し・変更点を出し、リンクは出さない': {
      args: { list: [rel('2026-10-01', 9, '見出し')] },
      expected: { contains: ['#9', '2026-10-01', '<b class="rttl">見出し</b>', '<li>変更</li>'], notContains: [UNRELEASED_LABEL, PENDING_TEXT, '<a ', 'github.com'], cards: 1 },
    },
    'success: 未リリースは「次のリリース」と未定の表示を出す': {
      args: { list: [rel(null, null, '進行中')] },
      expected: { contains: [UNRELEASED_LABEL, PENDING_TEXT, 'class="rel next"', '<b class="rttl">進行中</b>'], notContains: ['null'], cards: 1 },
    },
    'success: PR 番号だけ決まった未リリースは番号と未定を出す': {
      args: { list: [rel(null, 12, '進行中')] },
      expected: { contains: [UNRELEASED_LABEL, `#12・${PENDING_TEXT}`], notContains: ['null'], cards: 1 },
    },
    'success: 見出しと変更点は HTML エスケープする': {
      args: { list: [{ date: '2026-10-01', pr: 1, title: '<script>x</script>', changes: ['a & <b>'] }] },
      expected: { contains: ['&lt;script&gt;x&lt;/script&gt;', 'a &amp; &lt;b&gt;'], notContains: ['<script>', '<b>a'], cards: 1 },
    },
    'success: 1 PR = 1 カードで、すべて同じグループ（同時に 1 つだけ開く）': {
      args: { list: [rel('2026-09-26', 1), rel('2026-09-27', 2), rel(null, null)] },
      expected: { contains: [`name="${RELEASE_GROUP}"`], notContains: [], cards: 3 },
    },
    'success: 空なら「まだありません」と出す': {
      args: { list: [] },
      expected: { contains: [NO_RELEASES_TEXT], notContains: ['<details'], cards: 0 },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const html = releaseListHtml(tt.args.list);
      tt.expected.contains.forEach(t => expect(html).toContain(t));
      tt.expected.notContains.forEach(t => expect(html).not.toContain(t));
      expect(html.match(/<details /g)?.length ?? 0).toBe(tt.expected.cards);
      expect(html.match(new RegExp(`name="${RELEASE_GROUP}"`, 'g'))?.length ?? 0).toBe(tt.expected.cards);
    });
  }

  it('success: 実データはすべて閉じた状態で出る', () => {
    const html = releaseListHtml(RELEASES);
    expect(html.match(/<details /g)?.length).toBe(RELEASES.length);
    expect(html).not.toMatch(/<details[^>]*\sopen[\s>]/);
  });

  it('success: 先頭の未リリースの件は date と pr を埋めるだけでリリース済みの表示になる', () => {
    const filled = { ...RELEASES[0], date: '2026-10-02', pr: 10 };
    const html = releaseListHtml([filled]);
    expect(html).toContain('#10');
    expect(html).toContain('2026-10-02');
    expect(html).not.toContain(UNRELEASED_LABEL);
  });
});

describe('RELEASES（リリースノートのデータ）', () => {
  it('success: 日付は YYYY-MM-DD、見出しと変更点があり、PR 番号は重複しない', () => {
    const prs = RELEASES.flatMap(r => (r.pr === null ? [] : [r.pr]));
    expect(new Set(prs).size).toBe(prs.length);
    RELEASES.forEach(r => {
      if (r.date !== null) expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.title).not.toBe('');
      expect(r.changes.length).toBeGreaterThan(0);
    });
  });
  it('success: データは新しい順に並んでいる（先頭に足していく）', () => {
    expect(RELEASES.map(r => r.title)).toEqual(sortReleases(RELEASES).map(r => r.title));
  });
});
