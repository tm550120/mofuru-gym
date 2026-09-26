/** localStorage のラッパー（プライベートブラウズ等で使えなくても落ちない） */
export const store = {
  get: (k: string): string => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても続行 */ } },
};
