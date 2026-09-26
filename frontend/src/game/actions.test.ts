import { describe, expect, it } from 'vitest';
import { applyAction, type ActResult } from './actions';
import { createGame, vp } from './rules';
import { face, mainPhaseGame, seededRng, seqRng, setRes } from './testHelpers';
import type { Action, GameState } from './types';

/** 自分(A)の道の先に、ジムを置ける交差点を用意する */
function prepareSettleSpot(g: GameState): number {
  for (const v of g.V) {
    if (v.adj.some(a => g.V[a].owner !== null)) continue;
    g.E[v.edges[0]].owner = 0;
    return v.id;
  }
  throw new Error('no spot');
}

describe('applyAction', () => {
  const tests: Record<string, {
    args: { p: number; action: (g: GameState) => Action };
    setup: (g: GameState) => void;
    expected: { want: ActResult; check?: (g: GameState) => void };
  }> = {
    'success: 道を建てると木材1・レンガ1を払う': {
      args: { p: 0, action: g => ({ t: 'road', e: g.V[0].edges[1] }) },
      setup: g => { g.V[0].owner = 0; setRes(g, 0, { wood: 2, brick: 1 }); },
      expected: { want: 'update', check: g => { expect(g.players[0].res).toMatchObject({ wood: 1, brick: 0 }); expect(g.E[g.V[0].edges[1]].owner).toBe(0); } },
    },
    'success: ジムを建てると1点': {
      args: { p: 0, action: g => ({ t: 'settle', v: prepareSettleSpot(g) }) },
      setup: g => setRes(g, 0, { wood: 1, brick: 1, sheep: 1, wheat: 1 }),
      expected: { want: 'update', check: g => { expect(vp(g, 0)).toBe(1); expect(g.players[0].res).toEqual({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }); } },
    },
    'success: 都市にすると+1点（計2点）': {
      args: { p: 0, action: () => ({ t: 'city', v: 7 }) },
      setup: g => { g.V[7].owner = 0; setRes(g, 0, { wheat: 2, ore: 3 }); },
      expected: { want: 'update', check: g => { expect(g.V[7].city).toBe(true); expect(vp(g, 0)).toBe(2); } },
    },
    'success: 10点に達するとゲーム終了': {
      args: { p: 0, action: () => ({ t: 'city', v: 7 }) },
      setup: g => { g.V[7].owner = 0; [1, 3, 5, 9].forEach(v => { g.V[v].owner = 0; }); g.lr = 0; g.champ = 0; setRes(g, 0, { wheat: 2, ore: 3 }); },
      expected: { want: 'update', check: g => { expect(g.phase).toBe('over'); expect(g.winner).toBe(0); } },
    },
    'success: 銀行で4:1交換': {
      args: { p: 0, action: () => ({ t: 'trade', give: 'ore', get: 'wood' }) },
      setup: g => setRes(g, 0, { ore: 5 }),
      expected: { want: 'update', check: g => expect(g.players[0].res).toMatchObject({ ore: 1, wood: 1 }) },
    },
    'success: 同じ資源3枚で進化': {
      args: { p: 0, action: () => ({ t: 'evolve', r: 'wheat' }) },
      setup: g => setRes(g, 0, { wheat: 3 }),
      expected: { want: 'update', check: g => { expect(g.players[0].mon).toBe('wheat'); expect(g.players[0].res.wheat).toBe(0); } },
    },
    'success: ターン終了で次の人へ': {
      args: { p: 0, action: () => ({ t: 'end' }) },
      setup: () => {},
      expected: { want: 'turn', check: g => { expect(g.cur).toBe(1); expect(g.phase).toBe('roll'); } },
    },
    'success: バトルを見送る': {
      args: { p: 0, action: () => ({ t: 'skip' }) },
      setup: g => { g.phase = 'battle'; },
      expected: { want: 'update', check: g => { expect(g.phase).toBe('main'); expect(g.log[0]).toBe('Aは挑戦を見送った'); } },
    },
    'success: 7のときは自分の番でなくても捨てる資源を選べる': {
      args: { p: 1, action: () => ({ t: 'discard', r: { sheep: 4 } }) },
      setup: g => { g.phase = 'discard'; g.discard = { 1: 4 }; g.afterDiscard = 'main'; setRes(g, 1, { sheep: 8 }); },
      expected: { want: 'update', check: g => { expect(g.players[1].res.sheep).toBe(4); expect(g.phase).toBe('main'); expect(g.discard).toBeNull(); } },
    },
    'success: プレイヤーに交換を提案する': {
      args: { p: 0, action: () => ({ t: 'offer', to: 1, give: { ore: 2 }, want: { wood: 1 } }) },
      setup: g => setRes(g, 0, { ore: 2 }),
      expected: { want: 'update', check: g => expect(g.offer).toMatchObject({ from: 0, to: 1, give: { ore: 2 }, want: { wood: 1 }, resp: { 1: 'pending' } }) },
    },
    'success: 交換の提案に自分の番でなくても答えられる': {
      args: { p: 1, action: () => ({ t: 'respond', ok: true }) },
      setup: g => { setRes(g, 0, { ore: 2 }); setRes(g, 1, { wood: 1 }); applyAction(g, 0, { t: 'offer', to: 1, give: { ore: 2 }, want: { wood: 1 } }); },
      expected: { want: 'update', check: g => { expect(g.offer).toBeNull(); expect(g.players[0].res).toMatchObject({ ore: 0, wood: 1 }); expect(g.players[1].res).toMatchObject({ ore: 2, wood: 0 }); } },
    },
    'success: 自分の提案を取り下げる': {
      args: { p: 0, action: () => ({ t: 'cancelOffer' }) },
      setup: g => { setRes(g, 0, { ore: 2 }); applyAction(g, 0, { t: 'offer', to: 'all', give: { ore: 2 }, want: { wood: 1 } }); },
      expected: { want: 'update', check: g => { expect(g.offer).toBeNull(); expect(g.log[0]).toBe('Aは交換の提案を取り下げた'); } },
    },
    'failed: 交換の提案中は他の操作ができない': {
      args: { p: 0, action: () => ({ t: 'end' }) },
      setup: g => { setRes(g, 0, { ore: 2 }); applyAction(g, 0, { t: 'offer', to: 'all', give: { ore: 2 }, want: { wood: 1 } }); },
      expected: { want: false, check: g => { expect(g.cur).toBe(0); expect(g.offer).not.toBeNull(); } },
    },
    'failed: 提案がなければ取り下げられない': {
      args: { p: 0, action: () => ({ t: 'cancelOffer' }) },
      setup: () => {},
      expected: { want: false },
    },
    'failed: サイコロを振る前は交換を提案できない': {
      args: { p: 0, action: () => ({ t: 'offer', to: 'all', give: { ore: 1 }, want: { wood: 1 } }) },
      setup: g => { g.phase = 'roll'; setRes(g, 0, { ore: 1 }); },
      expected: { want: false, check: g => expect(g.offer).toBeNull() },
    },
    'failed: 提案されていないと答えられない': {
      args: { p: 1, action: () => ({ t: 'respond', ok: true }) },
      setup: () => {},
      expected: { want: false },
    },
    'failed: 7の捨て札の枚数が違う': {
      args: { p: 1, action: () => ({ t: 'discard', r: { sheep: 3 } }) },
      setup: g => { g.phase = 'discard'; g.discard = { 1: 4 }; g.afterDiscard = 'main'; setRes(g, 1, { sheep: 8 }); },
      expected: { want: false, check: g => { expect(g.players[1].res.sheep).toBe(8); expect(g.phase).toBe('discard'); } },
    },
    'failed: 7の捨て札を選んでいる間はターンを終えられない': {
      args: { p: 0, action: () => ({ t: 'end' }) },
      setup: g => { g.phase = 'discard'; g.discard = { 1: 4 }; },
      expected: { want: false, check: g => expect(g.cur).toBe(0) },
    },
    'failed: CPU の席の操作は受け付けない': {
      args: { p: 1, action: () => ({ t: 'respond', ok: true }) },
      setup: g => { g.players[1].type = 'cpu'; setRes(g, 0, { ore: 1 }); setRes(g, 1, { wood: 1 }); applyAction(g, 0, { t: 'offer', to: 1, give: { ore: 1 }, want: { wood: 1 } }); },
      expected: { want: false, check: g => expect(g.offer).not.toBeNull() },
    },
    'failed: 材料が足りないと道を建てられない': {
      args: { p: 0, action: g => ({ t: 'road', e: g.V[0].edges[1] }) },
      setup: g => { g.V[0].owner = 0; setRes(g, 0, { wood: 1 }); },
      expected: { want: false, check: g => expect(g.players[0].res.wood).toBe(1) },
    },
    'failed: 自分の番でなければ操作できない': {
      args: { p: 1, action: () => ({ t: 'end' }) },
      setup: () => {},
      expected: { want: false, check: g => expect(g.cur).toBe(0) },
    },
    'failed: 範囲外の交差点は無効': {
      args: { p: 0, action: () => ({ t: 'city', v: 999 }) },
      setup: g => setRes(g, 0, { wheat: 2, ore: 3 }),
      expected: { want: false },
    },
    'failed: 整数でない交差点は無効': {
      args: { p: 0, action: () => ({ t: 'city', v: 1.5 }) },
      setup: g => { g.V[1].owner = 0; setRes(g, 0, { wheat: 2, ore: 3 }); },
      expected: { want: false },
    },
    'failed: 同じ資源どうしは交換できない': {
      args: { p: 0, action: () => ({ t: 'trade', give: 'ore', get: 'ore' }) },
      setup: g => setRes(g, 0, { ore: 4 }),
      expected: { want: false },
    },
    'failed: 知らない資源名は交換できない': {
      args: { p: 0, action: () => ({ t: 'trade', give: 'gold', get: 'ore' }) as unknown as Action },
      setup: g => setRes(g, 0, { ore: 4 }),
      expected: { want: false },
    },
    'failed: 進化済みならもう進化できない': {
      args: { p: 0, action: () => ({ t: 'evolve', r: 'wood' }) },
      setup: g => { g.players[0].mon = 'ore'; setRes(g, 0, { wood: 3 }); },
      expected: { want: false, check: g => expect(g.players[0].mon).toBe('ore') },
    },
    'failed: 自分のジムにはバトルを挑めない': {
      args: { p: 0, action: () => ({ t: 'battle', v: 3 }) },
      setup: g => { g.phase = 'battle'; g.players[0].mon = 'wood'; g.V[3].owner = 0; },
      expected: { want: false },
    },
    'failed: CPU 処理中（busy）は操作できない': {
      args: { p: 0, action: () => ({ t: 'end' }) },
      setup: g => { g.busy = true; },
      expected: { want: false },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      tt.setup(g);
      const got = applyAction(g, tt.args.p, tt.args.action(g));
      expect(got).toBe(tt.expected.want);
      tt.expected.check?.(g);
    });
  }

  it('success: サイコロを振ると main フェーズへ', () => {
    const g = mainPhaseGame();
    g.phase = 'roll';
    expect(applyAction(g, 0, { t: 'roll' }, seqRng([face(2), face(3)]))).toBe('update');
    expect(g.dice).toEqual([2, 3]);
    expect(g.phase).toBe('main');
  });

  it('success: 7を振ると CPU はその場で捨て、人間は discard フェーズで選ぶ', () => {
    const g = mainPhaseGame();
    g.phase = 'roll';
    g.players[1].type = 'cpu';
    setRes(g, 0, { wood: 8 }); setRes(g, 1, { ore: 10 });
    const calls: [number, number][] = [];
    const got = applyAction(g, 0, { t: 'roll' }, seqRng([face(3), face(4)]), (gg, i, d) => { calls.push([i, d]); gg.players[i].res.ore -= d; });
    expect(got).toBe('update');
    expect(calls).toEqual([[1, 5]]);
    expect(g.players[1].res.ore).toBe(5);
    expect(g.phase).toBe('discard');
    expect(g.discard).toEqual({ 0: 4 });
  });

  it('success: バトルに勝つとバッジを得て main フェーズへ', () => {
    const g = mainPhaseGame();
    g.phase = 'battle';
    g.players[0].mon = 'sheep';
    g.V[3].owner = 1;
    expect(applyAction(g, 0, { t: 'battle', v: 3 }, seqRng([face(6), face(1)]))).toBe('update');
    expect(g.players[0].badges).toBe(1);
    expect(g.phase).toBe('main');
  });

  it('success: 初期配置はジム→道の順で、2巡目のジムで初期資源をもらう', () => {
    const g = createGame([{ name: 'A', type: 'local' }, { name: 'B', type: 'local' }], undefined, seededRng(3));
    expect(g.order).toEqual([0, 1, 1, 0]);
    const place = (p: number) => {
      g.cur = p;
      const v = g.V.find(x => x.owner === null && !x.adj.some(a => g.V[a].owner !== null) && x.hexes.length === 3)!;
      expect(applyAction(g, p, { t: 'road', e: v.edges[0] })).toBe(false); // 先にジム
      expect(applyAction(g, p, { t: 'settle', v: v.id })).toBe('update');
      expect(g.setupStep).toBe('road');
      const e = v.edges.find(id => g.E[id].owner === null)!;
      expect(applyAction(g, p, { t: 'road', e })).toBe('setup');
      return v.id;
    };
    place(0); place(1);
    const before = g.players[1].res;
    expect(Object.values(before).reduce((s, n) => s + n, 0)).toBe(0);
    const v = place(1);
    const gained = Object.values(g.players[1].res).reduce((s, n) => s + n, 0);
    expect(gained).toBe(g.V[v].hexes.filter(h => g.hexes[h].type !== 'desert').length);
    expect(g.setupIdx).toBe(3);
  });
});
