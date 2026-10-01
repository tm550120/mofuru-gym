/* 読み物ページ・管理ページからホーム（index.html）へ戻るリンク（a[data-home]）。
 * 履歴に積まずに今のページと置き換えるので、ホームでブラウザの「戻る」を押してもこれらのページには戻らない */
export function initHomeLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-home]').forEach(a => a.addEventListener('click', e => {
    /* 別タブで開く操作（Ctrl／⌘＋クリックなど）はそのまま通す */
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    location.replace(a.href);
  }));
}
