import { describe, expect, it } from 'vitest';
import { advanceTurn, cpuSeq, createGame, finishSetupIfDone, log, makeOffer, type CpuOrder } from './rules';
import { mainPhaseGame, seededRng, setRes } from './testHelpers';
import type { Seat } from './types';

describe('createGame / cpuSeq（手番の順）', () => {
  const seats: Seat[] = [{ name: 'あなた', type: 'local' }, { name: 'CPU 青', type: 'cpu' }, { name: 'CPU 橙', type: 'cpu' }];
  const bySeat = { seq: [0, 1, 2], order: [0, 1, 2, 2, 1, 0], firstLog: '手番：あなた → CPU 青 → CPU 橙' };
  const tests: Record<string, { args: { seq?: number[] }; expected: { seq: number[]; order: number[]; firstLog: string } }> = {
    'success: 手番の順で初期配置し、2巡目は逆順': {
      args: { seq: [1, 2, 0] },
      expected: { seq: [1, 2, 0], order: [1, 2, 0, 0, 2, 1], firstLog: '手番：CPU 青 → CPU 橙 → あなた' },
    },
    'success: 手番の指定がなければ席順': { args: {}, expected: bySeat },
    'success: 席の並べ替えになっていない手番は席順にする（重複）': { args: { seq: [0, 0, 1] }, expected: bySeat },
    'success: 席の並べ替えになっていない手番は席順にする（人数違い）': { args: { seq: [1, 0] }, expected: bySeat },
    'success: 席の並べ替えになっていない手番は席順にする（範囲外）': { args: { seq: [1, 2, 3] }, expected: bySeat },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = createGame(seats, tt.args.seq, seededRng(1));
      expect(g.seq).toEqual(tt.expected.seq);
      expect(g.order).toEqual(tt.expected.order);
      expect(g.cur).toBe(tt.expected.seq[0]);
      expect(g.log).toEqual(['島が見つかった。最初のジムを置こう', tt.expected.firstLog]);
      expect(g.logN).toBe(2);
      // 色は手番ではなく席番号で決まる
      expect(g.players.map(p => p.color)).toEqual(['#d9453a', '#2f6fd6', '#e8961e']);
      expect(g).toMatchObject({ rollN: 0, discard: null, afterDiscard: null, offer: null, offerN: 0, turnN: 0, cpuTradeTurn: -1 });
    });
  }

  const seqTests: Record<string, { args: { o: CpuOrder }; expected: { want: number[] } }> = {
    'success: 先攻': { args: { o: '1' }, expected: { want: [0, 1, 2] } },
    'success: 2番目': { args: { o: '2' }, expected: { want: [1, 0, 2] } },
    'success: 3番目': { args: { o: '3' }, expected: { want: [1, 2, 0] } },
  };
  for (const [name, tt] of Object.entries(seqTests)) {
    it(name, () => { expect(cpuSeq(tt.args.o)).toEqual(tt.expected.want); });
  }
  it('success: ランダムは3人の並べ替え', () => {
    for (let seed = 1; seed <= 10; seed++) expect([...cpuSeq('r', seededRng(seed))].sort()).toEqual([0, 1, 2]);
  });
});

describe('advanceTurn / finishSetupIfDone（手番の交代）', () => {
  const tests: Record<string, { args: { seq: number[]; cur: number }; expected: { cur: number; log: string } }> = {
    'success: 手番の順で次の人へ': { args: { seq: [2, 0, 1], cur: 2 }, expected: { cur: 0, log: '▶ Aの番' } },
    'success: 最後の人の次は最初の人': { args: { seq: [2, 0, 1], cur: 1 }, expected: { cur: 2, log: '▶ Cの番' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.seq = tt.args.seq; g.cur = tt.args.cur; g.busy = true;
      advanceTurn(g);
      expect(g.cur).toBe(tt.expected.cur);
      expect(g.phase).toBe('roll');
      expect(g.busy).toBe(false);
      expect(g.turnN).toBe(1);
      expect(g.log[0]).toBe(tt.expected.log);
    });
  }
  it('success: 交代のときに出ている交換の提案は取り下げ', () => {
    const g = mainPhaseGame();
    setRes(g, 0, { wood: 1 });
    makeOffer(g, 0, 'all', { wood: 1 }, { ore: 1 });
    advanceTurn(g);
    expect(g.offer).toBeNull();
    expect(g.log.slice(0, 2)).toEqual(['▶ Bの番', 'Aは交換の提案を取り下げた']);
  });
  it('success: 初期配置が終わったら手番の最初の人から始める', () => {
    const g = createGame([{ name: 'A', type: 'local' }, { name: 'B', type: 'cpu' }], [1, 0], seededRng(2));
    expect(finishSetupIfDone(g)).toBe(false);
    g.setupIdx = g.order.length; g.cur = 0; g.lastSettle = 3; g.busy = true;
    expect(finishSetupIfDone(g)).toBe(true);
    expect(g).toMatchObject({ phase: 'roll', cur: 1, lastSettle: null, busy: false });
    expect(g.log[0]).toBe('準備完了。Bから始めます');
  });
});

describe('log（出来事）', () => {
  it('success: 新しい順に最大40件、logN はこれまでの件数', () => {
    const g = mainPhaseGame();
    g.logN = 0;
    for (let i = 1; i <= 45; i++) log(g, 'e' + i);
    expect(g.log).toHaveLength(40);
    expect(g.log[0]).toBe('e45');
    expect(g.log[39]).toBe('e6');
    expect(g.logN).toBe(45);
  });
});
