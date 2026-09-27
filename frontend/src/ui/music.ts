/* 画面の状態から場面を決めて BGM に伝える（BGM の試験機能がオフなら setBgmScene が何もしない） */
import { app } from '../app/state';
import { setBgmScene } from '../audio/bgm';
import { sceneOf } from '../audio/bgm/scene';

const shown = (id: string): boolean => !!document.getElementById(id)?.classList.contains('show');

/** タイトルの表示／非表示、バトル演出の開閉のたびに呼ぶ */
export function syncMusic(): void {
  setBgmScene(sceneOf({ titleShown: shown('title'), battleOpen: shown('battleBg'), inGame: !!app.G, over: app.G?.phase === 'over' }));
}
