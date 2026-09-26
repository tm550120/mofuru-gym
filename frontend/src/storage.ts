/** localStorage のラッパー（プライベートブラウズ等で使えなくても落ちない） */
export const store = {
  get: (k: string): string => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても続行 */ } },
  del: (k: string): void => { try { localStorage.removeItem(k); } catch { /* 消せなくても続行 */ } },
};

/** JSON を読み込む（無い・壊れているときは null） */
export function loadJSON<T>(k: string): T | null {
  try { const s = store.get(k); return s ? JSON.parse(s) as T : null; } catch { return null; }
}
