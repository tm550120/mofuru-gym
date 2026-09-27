import './style.css';
import { hooks } from './app/session';
import { initBgm } from './audio/bgm';
import { initAudioUnlock } from './audio/sfx';
import { Net } from './net/online';
import { waitBattleClosed } from './ui/battle';
import { initBoard } from './ui/board';
import { initControls } from './ui/controls';
import { adoptLoaded, render, resetLocalUI } from './ui/render';
import { initSheets } from './ui/sheets';
import { initTitle } from './ui/title';

// ゲーム進行（app/session）に描画と通信をつなぐ
hooks.render = render;
hooks.broadcast = Net.broadcastState;
hooks.saveHost = Net.save;
hooks.sendAction = Net.sendAction;
hooks.resetLocalUI = resetLocalUI;
hooks.adoptLoaded = adoptLoaded;
hooks.waitBattleClosed = waitBattleClosed;

initAudioUnlock();
initBgm();
initBoard();
initControls();
initSheets();
initTitle();
