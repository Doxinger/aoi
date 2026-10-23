import { authApi } from '../services/auth.js';
import { state } from '../state.js';

const TICK_MS = 5000;
const FLUSH_AT = 60;
const ACTIVE_WINDOW = 9000;
const END_MARGIN = 30;

let pendingSeconds = 0;
let lastActive = 0;
const reported = new Set();

export function noteActivity() {
  lastActive = Date.now();
}

export function checkEpisodeEnd() {
  const cur = state.cur;
  if (!cur || !state.user || !state.live) return;
  const dur = Number(state.live.dur) || 0;
  const t = Number(state.live.t) || 0;
  if (!dur || t < dur - END_MARGIN) return;
  const ep = Math.max(0, Number(state.live.ep) || 0);
  const season = Math.max(0, Number(state.live.season) || 0);
  const id = `${cur.key}:${season}:${ep}`;
  if (reported.has(id)) return;
  reported.add(id);
  authApi.markEpisode(cur.key, season, ep).catch(() => reported.delete(id));
}

function flushTime(minSeconds) {
  const seconds = Math.floor(pendingSeconds);
  if (!state.user || seconds < minSeconds) return;
  pendingSeconds -= seconds;
  authApi.addWatchTime(seconds).catch(() => {
    pendingSeconds += seconds;
  });
}

function tick() {
  if (state.user && state.cur && !document.hidden && Date.now() - lastActive < ACTIVE_WINDOW) {
    pendingSeconds += TICK_MS / 1000;
  }
  if (pendingSeconds >= FLUSH_AT) flushTime(FLUSH_AT);
}

setInterval(tick, TICK_MS);

addEventListener('pagehide', () => flushTime(10));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushTime(10);
});
