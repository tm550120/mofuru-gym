import { describe, expect, it } from 'vitest';
import { mainPhaseGame, seqRng, setRes } from '../game/testHelpers';
import type { Mon, Offer, Resources } from '../game/types';
import { aiAct, aiGoals, aiNeeds, aiPickType, aiTradeIdea, cpuDiscard, cpuLikes, pickBattleTarget } from './ai';

describe('pickBattleTarget', () => {
  const tests: Record<string, {
    args: { am: Mon; dm: Mon; city: boolean };
    expected: { want: number | null };
  }> = {
    'success: 勝率40%以上なら挑む': { args: { am: 'sheep', dm: 'brick', city: false }, expected: { want: 4 } },
    'success: 勝率40%未満なら見送る': { args: { am: 'brick', dm: 'sheep', city: true }, expected: { want: null } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.players[1].type = 'cpu';
      g.players[1].mon = tt.args.am;
      g.players[0].mon = tt.args.dm;
      g.V[4].owner = 0; g.V[4].city = tt.args.city;
      expect(pickBattleTarget(g, 1, seqRng([0]))).toBe(tt.expected.want);
    });
  }
});

describe('aiPickType', () => {
  it('success: 相手に有利なタイプを選ぶ', () => {
    const g = mainPhaseGame();
    setRes(g, 1, { sheep: 3, wood: 3 });
    g.players[0].mon = 'brick'; // 風(sheep)が炎(brick)に強い
    expect(aiPickType(g, 1, seqRng([0]))).toBe('sheep');
  });
  it('success: 3枚そろった資源がなければ null', () => {
    const g = mainPhaseGame();
    setRes(g, 1, { sheep: 2, wood: 2 });
    expect(aiPickType(g, 1, seqRng([0]))).toBeNull();
  });
});

describe('aiAct', () => {
  it('success: 都市の材料があれば都市を建てる', () => {
    const g = mainPhaseGame();
    g.V[2].owner = 1;
    setRes(g, 1, { wheat: 2, ore: 3 });
    expect(aiAct(g, 1, seqRng([0]))).toBe(true);
    expect(g.V[2].city).toBe(true);
  });
  it('success: 何もできなければ false', () => {
    const g = mainPhaseGame();
    setRes(g, 1, {});
    expect(aiAct(g, 1, seqRng([0]))).toBe(false);
  });
  it('success: あと1枚のときは全員に交換を提案する（1ターンに1回）', () => {
    const g = mainPhaseGame();
    g.cur = 1; g.turnN = 3;
    setRes(g, 1, { wood: 1, ore: 3 });
    expect(aiAct(g, 1, seqRng([0]))).toBe(true);
    expect(g.offer).toMatchObject({ from: 1, to: 'all', give: { ore: 1 }, want: { brick: 1 } });
    expect(g.cpuTradeTurn).toBe(3);
    g.offer = null;
    expect(aiAct(g, 1, seqRng([0]))).toBe(false);
  });
  it('success: 都市にしても最長の道を計算し直す', () => {
    const g = mainPhaseGame();
    g.V[2].owner = 1;
    g.lens = [9, 9, 9];
    setRes(g, 1, { wheat: 2, ore: 3 });
    expect(aiAct(g, 1, seqRng([0]))).toBe(true);
    expect(g.lens).toEqual([0, 0, 0]);
  });
});

describe('aiGoals / aiNeeds', () => {
  it('success: 都市にできるジムがあれば都市、置ける場所がなければ道を目指す', () => {
    const g = mainPhaseGame();
    g.V[2].owner = 1;
    expect(aiGoals(g, 1)).toEqual(['city', 'road']);
    // 足りない資源は 0.6 ずつ
    expect(aiNeeds(g, 1)).toEqual({ wheat: .6, ore: .6, wood: .6, brick: .6 });
  });
  it('success: 持っている資源の重みは小さい（0.2）', () => {
    const g = mainPhaseGame();
    setRes(g, 1, { wood: 1 });
    expect(aiGoals(g, 1)).toEqual(['road']);
    expect(aiNeeds(g, 1)).toEqual({ wood: .2, brick: .6 });
  });
});

describe('cpuDiscard（7のときの CPU の捨て札）', () => {
  const tests: Record<string, {
    args: { res: Partial<Resources>; d: number; city?: boolean };
    expected: { after: Partial<Resources>; log: string };
  }> = {
    'success: 多く持っている資源から捨てる': {
      args: { res: { sheep: 6, wood: 1, brick: 1 }, d: 4 },
      expected: { after: { sheep: 2, wood: 1, brick: 1 }, log: 'Bは手札が多いので4枚捨てた（🐑×4）' },
    },
    'success: 作りたい物に要る資源は重みの分だけ残しやすい（同じ4枚なら要らない羊毛から）': {
      args: { res: { ore: 4, wheat: 2, sheep: 4 }, d: 5, city: true },
      expected: { after: { ore: 2, wheat: 2, sheep: 1 }, log: 'Bは手札が多いので5枚捨てた（🐑×3🪨×2）' },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      if (tt.args.city) g.V[2].owner = 1;
      setRes(g, 1, tt.args.res);
      cpuDiscard(g, 1, tt.args.d, seqRng([0]));
      expect(g.players[1].res).toMatchObject(tt.expected.after);
      expect(g.log[0]).toBe(tt.expected.log);
    });
  }
});

describe('cpuLikes（交換の提案を受けるか）', () => {
  const offer = (give: Offer['give'], want: Offer['want']): Offer => ({ id: 1, from: 0, to: 1, give, want, resp: { 1: 'pending' } });
  const tests: Record<string, {
    args: { res: Partial<Resources>; o: Offer; leaderGyms?: number };
    expected: { want: boolean };
  }> = {
    'success: 余っている資源で足りない資源がもらえるなら受ける': {
      args: { res: { ore: 5 }, o: offer({ brick: 1 }, { ore: 1 }) },
      expected: { want: true },
    },
    'success: 損な交換は断る': {
      args: { res: { brick: 1 }, o: offer({ ore: 1 }, { brick: 1 }) },
      expected: { want: false },
    },
    'success: 渡す資源を持っていなければ断る': {
      args: { res: {}, o: offer({ brick: 2 }, { ore: 1 }) },
      expected: { want: false },
    },
    'success: あと少しで勝つ人からの提案は受けにくい': {
      args: { res: { ore: 5 }, o: offer({ brick: 1 }, { ore: 1 }), leaderGyms: 8 },
      expected: { want: false },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      setRes(g, 1, tt.args.res);
      for (let i = 0; i < (tt.args.leaderGyms ?? 0); i++) g.V[40 + i].owner = 0;
      // 乱数 .5 で揺らぎなし
      expect(cpuLikes(g, 1, tt.args.o, seqRng([.5]))).toBe(tt.expected.want);
    });
  }
});

describe('aiTradeIdea（CPU からの交換の提案）', () => {
  const tests: Record<string, { args: { res: Partial<Resources> }; expected: { want: ReturnType<typeof aiTradeIdea> } }> = {
    'success: あと1枚で道が作れるなら、余っている資源1枚と交換を持ちかける': {
      args: { res: { wood: 1, ore: 3 } },
      expected: { want: { give: { ore: 1 }, want: { brick: 1 } } },
    },
    'success: 2枚以上足りなければ提案しない': {
      args: { res: { ore: 3 } },
      expected: { want: null },
    },
    'success: 余っている資源がなければ提案しない': {
      args: { res: { wood: 1, ore: 1 } },
      expected: { want: null },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      setRes(g, 1, tt.args.res);
      expect(aiTradeIdea(g, 1)).toEqual(tt.expected.want);
    });
  }
});
