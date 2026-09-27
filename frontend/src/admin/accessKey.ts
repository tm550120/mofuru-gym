/* 管理ページのアクセスキー確認
 * 注意：これはブラウザ内だけの簡易ロック（クライアントサイド）で、本当のセキュリティではない。
 * 静的サイトなのでソースを読めば回避できる。見られて困る情報や操作は管理ページに置かないこと。
 * キーそのものはソースに書かず、SHA-256 のハッシュと比べる。 */

/** アクセスキーの SHA-256（16進数） */
const KEY_SHA256 = 'bcb15f821479b4d5772bd0ca866c00ad5f926e3580720659cc80d39c9d09802a';

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 入力されたキーが正しいか（前後の空白は無視。空なら常に false） */
export async function checkAccessKey(input: string): Promise<boolean> {
  const s = input.trim();
  if (!s) return false;
  try { return (await sha256Hex(s)) === KEY_SHA256; } catch { return false; }
}
