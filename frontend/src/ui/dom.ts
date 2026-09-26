/** 要素を取る（index.html に必ずある要素だけに使う） */
export const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
