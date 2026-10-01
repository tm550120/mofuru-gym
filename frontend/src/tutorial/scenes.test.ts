import { describe, expect, it } from 'vitest';
import { canRoad, canSettle, longestRoad, vp } from '../game/rules';
import { ME, sceneBattlePick, sceneBuildGym, sceneFirstGym, sceneFirstRoad, sceneFirstTurn, sceneLongestRoad } from './scenes';

/* チュートリアルの図が、説明文に書いたルールどおりの盤面になっていること */
describe('チュートリアルの図の盤面', () => {
  it('success: 何度作っても同じ島になる', () => {
    expect(sceneFirstGym().g.hexes).toEqual(sceneFirstGym().g.hexes);
    expect(sceneFirstTurn().hexes).toEqual(sceneFirstGym().g.hexes);
  });

  it('success: 初期配置①はまだ何も置かれておらず、どの交差点にもジムを置ける', () => {
    const { g, dots } = sceneFirstGym();
    expect(g.phase).toBe('setup');
    expect(g.cur).toBe(ME);
    expect(g.V.every(v => v.owner === null)).toBe(true);
    expect(dots.length).toBe(g.V.length);
  });

  it('success: 初期配置②は置いたジムから伸びる辺だけに道を置ける', () => {
    const { g, gym, roads } = sceneFirstRoad();
    expect(g.V[gym].owner).toBe(ME);
    expect(roads.length).toBeGreaterThanOrEqual(2);
    roads.forEach(e => {
      expect(canRoad(g, e, ME)).toBe(true);
      expect([g.E[e].a, g.E[e].b]).toContain(gym);
    });
  });

  it('success: 初期配置が終わると全員ジム2つ・道2本で2点、あなたの番から始まる', () => {
    const g = sceneFirstTurn();
    expect(g.phase).toBe('roll');
    expect(g.cur).toBe(ME);
    g.players.forEach((_, p) => {
      expect(g.V.filter(v => v.owner === p).length).toBe(2);
      expect(g.E.filter(e => e.owner === p).length).toBe(2);
      expect(vp(g, p)).toBe(2);
    });
    expect(g.log[0]).toBe('準備完了。あなたから始めます');
  });

  it('success: ジムは道でつながった2辺先に建てられ、となりの交差点には建てられない', () => {
    const { g, gym, dots, blocked } = sceneBuildGym();
    expect(g.E.filter(e => e.owner === ME).length).toBe(2);
    expect(dots.length).toBe(1);
    expect(canSettle(g, dots[0], ME, false)).toBe(true);
    expect(g.V[gym].adj).not.toContain(dots[0]);
    expect(blocked.length).toBeGreaterThanOrEqual(2);
    blocked.forEach(v => expect(canSettle(g, v, ME, false)).toBe(false));
  });

  it('success: 最長の道の図はジムとジムをつなぐ道が5本で、最長の道（+2点）になっている', () => {
    const { g, path, ends } = sceneLongestRoad();
    expect(path.length).toBe(5);
    expect(ends[0]).not.toBe(ends[1]);
    ends.forEach(v => expect(g.V[v].owner).toBe(ME));
    expect(longestRoad(g, ME)).toBe(5);
    expect(g.lr).toBe(ME);
    expect(vp(g, ME)).toBe(4);
  });

  it('success: 挑戦先の図の勝率は早見表の数字（ジム/都市 × 進化前/相性有利）と同じ', () => {
    const { g, targets } = sceneBattlePick();
    const pcOf = (p: number, city: boolean): number[] => targets.filter(t => g.V[t.v].owner === p && g.V[t.v].city === city).map(t => t.pc);
    expect(targets.length).toBe(4);
    /* CPU 青（草）にはあなた（炎）が相性有利 */
    expect(pcOf(1, false)).toEqual([58]);
    expect(pcOf(1, true)).toEqual([42]);
    /* CPU 橙は進化前 */
    expect(pcOf(2, false)).toEqual([72]);
    expect(pcOf(2, true)).toEqual([58]);
  });
});
