/* 手番中の操作ボタン（建設・進化・交換・メインボタン） */
import { doAction, myTurn } from '../app/session';
import { app } from '../app/state';
import { canEvolve } from '../game/rules';
import { $ } from './dom';
import { ui, type UiMode } from './local';
import { render } from './render';
import { openEvo, openTrade } from './sheets';
import { playAgain } from './title';

export function initControls(): void {
  document.querySelectorAll<HTMLButtonElement>('.ab').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act; if (!myTurn() || app.G!.phase !== 'main') return;
    if (a === 'trade') { openTrade(); return; }
    if (a === 'evolve') { openEvo(); return; }
    const m = a as UiMode;
    ui.mode = ui.mode === m ? null : m; render();
  }));
  $('#mymon').addEventListener('click', () => { if (myTurn() && app.G!.phase === 'main' && canEvolve(app.G!, app.me)) openEvo(); });
  $('#main').addEventListener('click', () => {
    const G = app.G;
    if (!G) return;
    if (G.phase === 'over') { playAgain(); return; }
    if (!myTurn()) return;
    if (G.phase === 'roll') doAction({ t: 'roll' });
    else if (G.phase === 'battle') doAction({ t: 'skip' });
    else if (G.phase === 'main') { ui.mode = null; doAction({ t: 'end' }); }
  });
}
