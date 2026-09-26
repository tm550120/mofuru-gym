import { describe, expect, it } from 'vitest';
import { cancelOffer, cleanBundle, doDiscard, finishDiscard, fmtRes, makeOffer, respondOffer, sumRes } from './rules';
import { mainPhaseGame, setRes } from './testHelpers';
import type { Bundle, GameState, Resources } from './types';

describe('doDiscard / finishDiscard（7の捨て札）', () => {
  /** A が 4枚、B が 5枚捨てる discard フェーズ（終わったらバトルへ） */
  const discardPhase = (): GameState => {
    const g = mainPhaseGame();
    g.phase = 'discard'; g.discard = { 0: 4, 1: 5 }; g.afterDiscard = 'battle';
    setRes(g, 0, { wood: 5, ore: 4 });
    setRes(g, 1, { sheep: 10 });
    return g;
  };
  const untouched = { phase: 'discard' as const, discard: { 0: 4, 1: 5 } };
  const tests: Record<string, {
    args: { p: number; sel: unknown; before?: (g: GameState) => void };
    expected: { want: boolean; res0?: Partial<Resources>; phase: GameState['phase']; discard: Record<number, number> | null; log?: string };
  }> = {
    'success: 選んだ資源をちょうど捨てる（まだ捨てる人がいれば discard のまま）': {
      args: { p: 0, sel: { wood: 3, ore: 1 } },
      expected: { want: true, res0: { wood: 2, ore: 3 }, phase: 'discard', discard: { 1: 5 }, log: 'Aは🌲×3🪨を捨てた' },
    },
    'success: 最後の人が捨てると afterDiscard のフェーズへ進む': {
      args: { p: 1, sel: { sheep: 5 }, before: g => { delete g.discard![0]; } },
      expected: { want: true, phase: 'battle', discard: null, log: 'Bは🐑×5を捨てた' },
    },
    'failed: 枚数が足りない': { args: { p: 0, sel: { wood: 3 } }, expected: { want: false, res0: { wood: 5, ore: 4 }, ...untouched } },
    'failed: 枚数が多すぎる': { args: { p: 0, sel: { wood: 5 } }, expected: { want: false, ...untouched } },
    'failed: 持っていない資源は捨てられない': { args: { p: 0, sel: { wheat: 4 } }, expected: { want: false, ...untouched } },
    'failed: 負の枚数は無効': { args: { p: 0, sel: { wood: 5, ore: -1 } }, expected: { want: false, ...untouched } },
    'failed: 整数でない枚数は無効': { args: { p: 0, sel: { wood: 3.5, ore: 0.5 } }, expected: { want: false, ...untouched } },
    'failed: 捨てる必要のない人は捨てられない': { args: { p: 2, sel: { wood: 1 } }, expected: { want: false, ...untouched } },
    'failed: オブジェクトでない選択は無効': { args: { p: 0, sel: 'wood' }, expected: { want: false, ...untouched } },
    'failed: discard フェーズでなければ捨てられない': {
      args: { p: 0, sel: { wood: 4 }, before: g => { g.phase = 'main'; } },
      expected: { want: false, phase: 'main', discard: { 0: 4, 1: 5 } },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = discardPhase();
      tt.args.before?.(g);
      expect(doDiscard(g, tt.args.p, tt.args.sel)).toBe(tt.expected.want);
      if (tt.expected.res0) expect(g.players[0].res).toMatchObject(tt.expected.res0);
      expect(g.phase).toBe(tt.expected.phase);
      expect(g.discard).toEqual(tt.expected.discard);
      if (tt.expected.log) expect(g.log[0]).toBe(tt.expected.log);
      else expect(g.log).toEqual([]);
    });
  }
  it('success: finishDiscard は afterDiscard が無ければ main へ', () => {
    const g = mainPhaseGame();
    g.phase = 'discard'; g.discard = {}; g.afterDiscard = null;
    finishDiscard(g);
    expect(g.phase).toBe('main');
    expect(g.discard).toBeNull();
  });
  it('success: finishDiscard はまだ捨てる人がいれば何もしない', () => {
    const g = mainPhaseGame();
    g.phase = 'discard'; g.discard = { 2: 4 }; g.afterDiscard = 'battle';
    finishDiscard(g);
    expect(g.phase).toBe('discard');
    expect(g.discard).toEqual({ 2: 4 });
  });
});

describe('cleanBundle / fmtRes / sumRes（資源の組）', () => {
  const tests: Record<string, { args: { o: unknown }; expected: { want: Bundle | null; fmt?: string; sum?: number } }> = {
    'success: 0枚と知らない資源名は取り除く': { args: { o: { wood: 2, brick: 0, gold: 3 } }, expected: { want: { wood: 2 }, fmt: '🌲×2', sum: 2 } },
    'success: 複数の資源は資源の順に表示': { args: { o: { ore: 1, sheep: 3 } }, expected: { want: { sheep: 3, ore: 1 }, fmt: '🐑×3🪨', sum: 4 } },
    'failed: 空の組は null': { args: { o: {} }, expected: { want: null } },
    'failed: 負の枚数は null': { args: { o: { wood: -1 } }, expected: { want: null } },
    'failed: 20枚以上は null': { args: { o: { wood: 20 } }, expected: { want: null } },
    'failed: 整数でない枚数は null': { args: { o: { wood: 1.5 } }, expected: { want: null } },
    'failed: オブジェクトでなければ null': { args: { o: 'wood' }, expected: { want: null } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const got = cleanBundle(tt.args.o);
      expect(got).toEqual(tt.expected.want);
      if (tt.expected.fmt !== undefined) expect(fmtRes(got)).toBe(tt.expected.fmt);
      if (tt.expected.sum !== undefined) expect(sumRes(got)).toBe(tt.expected.sum);
    });
  }
  it('success: 空なら「なし」・0枚', () => {
    expect(fmtRes({})).toBe('なし');
    expect(fmtRes(null)).toBe('なし');
    expect(sumRes(null)).toBe(0);
  });
});

describe('makeOffer（交換の提案）', () => {
  const tests: Record<string, {
    args: { to: unknown; give: unknown; want: unknown };
    expected: { want: boolean; resp?: Record<number, string>; log?: string };
  }> = {
    'success: 全員に提案する': {
      args: { to: 'all', give: { wood: 1 }, want: { ore: 1 } },
      expected: { want: true, resp: { 1: 'pending', 2: 'pending' }, log: '🤝 Aがみんなに交換を提案：🌲 → 🪨' },
    },
    'success: 1人に提案する': {
      args: { to: 2, give: { wood: 2 }, want: { ore: 1, sheep: 1 } },
      expected: { want: true, resp: { 2: 'pending' }, log: '🤝 AがCに交換を提案：🌲×2 → 🐑🪨' },
    },
    'failed: 持っていない資源は出せない': { args: { to: 'all', give: { wheat: 1 }, want: { ore: 1 } }, expected: { want: false } },
    'failed: 同じ資源を出してもらうことはできない': { args: { to: 'all', give: { wood: 1 }, want: { wood: 1, ore: 1 } }, expected: { want: false } },
    'failed: ほしい資源が空': { args: { to: 'all', give: { wood: 1 }, want: {} }, expected: { want: false } },
    'failed: 自分には提案できない': { args: { to: 0, give: { wood: 1 }, want: { ore: 1 } }, expected: { want: false } },
    'failed: いない席には提案できない': { args: { to: 5, give: { wood: 1 }, want: { ore: 1 } }, expected: { want: false } },
    'failed: 相手の指定が不正': { args: { to: '1', give: { wood: 1 }, want: { ore: 1 } }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      setRes(g, 0, { wood: 2 });
      expect(makeOffer(g, 0, tt.args.to, tt.args.give, tt.args.want)).toBe(tt.expected.want);
      if (tt.expected.want) {
        expect(g.offer).toMatchObject({ id: 1, from: 0, to: tt.args.to, resp: tt.expected.resp });
        expect(g.offerN).toBe(1);
        expect(g.log[0]).toBe(tt.expected.log);
      } else {
        expect(g.offer).toBeNull();
        expect(g.log).toEqual([]);
      }
    });
  }
});

describe('respondOffer / cancelOffer（交換の返事）', () => {
  /** A が全員に 🌲×2 → 🪨 を提案している */
  const offering = (): GameState => {
    const g = mainPhaseGame();
    setRes(g, 0, { wood: 2 }); setRes(g, 1, { ore: 1 }); setRes(g, 2, {});
    makeOffer(g, 0, 'all', { wood: 2 }, { ore: 1 });
    g.log = [];
    return g;
  };
  const tests: Record<string, {
    args: { steps: [number, boolean][]; before?: (g: GameState) => void };
    expected: { want: boolean[]; offer: 'open' | 'closed'; res: [Partial<Resources>, Partial<Resources>]; log: string[] };
  }> = {
    'success: 受けると交換が成立する': {
      args: { steps: [[1, true]] },
      expected: { want: [true], offer: 'closed', res: [{ wood: 0, ore: 1 }, { wood: 2, ore: 0 }], log: ['🤝 交換成立：Aの🌲×2とBの🪨'] },
    },
    'success: 1人が断っても、まだ考え中の人がいれば続く': {
      args: { steps: [[2, false]] },
      expected: { want: [true], offer: 'open', res: [{ wood: 2 }, { ore: 1 }], log: ['Cは交換を断った'] },
    },
    'success: 全員に断られたら不成立': {
      args: { steps: [[2, false], [1, false]] },
      expected: { want: [true, true], offer: 'closed', res: [{ wood: 2 }, { ore: 1 }], log: ['交換は成立しなかった', 'Bは交換を断った', 'Cは交換を断った'] },
    },
    'success: 提案した人の資源が足りなくなっていたら取り消し': {
      args: { steps: [[1, true]], before: g => { g.players[0].res.wood = 1; } },
      expected: { want: [true], offer: 'closed', res: [{ wood: 1 }, { ore: 1 }], log: ['Aの資源が足りないので交換は取り消し'] },
    },
    'failed: 渡す資源が足りないと受けられない': {
      args: { steps: [[2, true]] },
      expected: { want: [false], offer: 'open', res: [{ wood: 2 }, { ore: 1 }], log: [] },
    },
    'failed: 一度断った人はもう答えられない': {
      args: { steps: [[2, false], [2, true]] },
      expected: { want: [true, false], offer: 'open', res: [{ wood: 2 }, { ore: 1 }], log: ['Cは交換を断った'] },
    },
    'failed: 提案した本人は答えられない': {
      args: { steps: [[0, true]] },
      expected: { want: [false], offer: 'open', res: [{ wood: 2 }, { ore: 1 }], log: [] },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = offering();
      tt.args.before?.(g);
      expect(tt.args.steps.map(([p, ok]) => respondOffer(g, p, ok))).toEqual(tt.expected.want);
      expect(g.offer === null ? 'closed' : 'open').toBe(tt.expected.offer);
      expect(g.players[0].res).toMatchObject(tt.expected.res[0]);
      expect(g.players[1].res).toMatchObject(tt.expected.res[1]);
      expect(g.log).toEqual(tt.expected.log);
    });
  }
  it('success: 提案を取り下げる', () => {
    const g = offering();
    cancelOffer(g);
    expect(g.offer).toBeNull();
    expect(g.log).toEqual(['Aは交換の提案を取り下げた']);
  });
  it('success: 提案がなければ取り下げても何も起きない', () => {
    const g = mainPhaseGame();
    cancelOffer(g);
    expect(g.log).toEqual([]);
  });
});
