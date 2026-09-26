import { S, SQ3 } from './constants';
import { defaultRng, shuffle } from './random';
import type { Board, Edge, Hex, Rng, TileType, Vertex } from './types';

/** 19マスの島を作る。6と8が隣り合わないよう数字を配り直す（最大800回） */
export function makeBoard(rng: Rng = defaultRng): Board {
  const coords: [number, number][] = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) coords.push([q, r]);
  const types = shuffle<TileType>([
    ...Array<TileType>(4).fill('wood'), ...Array<TileType>(4).fill('sheep'), ...Array<TileType>(4).fill('wheat'),
    ...Array<TileType>(3).fill('brick'), ...Array<TileType>(3).fill('ore'), 'desert',
  ], rng);
  const hexes: Hex[] = coords.map(([q, r], i) => ({ id: i, q, r, type: types[i], num: 0, x: S * SQ3 * (q + r / 2), y: S * 1.5 * r, verts: [] }));
  const idx = new Map(hexes.map(h => [h.q + ',' + h.r, h]));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const nums = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const hot = (n: number) => n === 6 || n === 8;
  for (let t = 0; t < 800; t++) {
    shuffle(nums, rng); let k = 0; hexes.forEach(h => { h.num = h.type === 'desert' ? 0 : nums[k++]; });
    if (!hexes.some(h => hot(h.num) && dirs.some(([a, b]) => { const n = idx.get((h.q + a) + ',' + (h.r + b)); return !!n && hot(n.num); }))) break;
  }
  const V: Vertex[] = [], E: Edge[] = [], vmap = new Map<string, number>(), emap = new Map<string, number>();
  hexes.forEach(h => {
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30), x = h.x + S * Math.cos(a), y = h.y + S * Math.sin(a);
      const key = Math.round(x * 10) + ',' + Math.round(y * 10);
      let v = vmap.get(key);
      if (v === undefined) { v = V.length; V.push({ id: v, x, y, hexes: [], adj: [], edges: [], owner: null, city: false }); vmap.set(key, v); }
      V[v].hexes.push(h.id); h.verts.push(v); ids.push(v);
    }
    for (let i = 0; i < 6; i++) {
      const a = ids[i], b = ids[(i + 1) % 6], key = Math.min(a, b) + '-' + Math.max(a, b);
      if (!emap.has(key)) { const e = E.length; E.push({ id: e, a, b, owner: null }); emap.set(key, e); V[a].edges.push(e); V[b].edges.push(e); V[a].adj.push(b); V[b].adj.push(a); }
    }
  });
  return { hexes, V, E };
}
