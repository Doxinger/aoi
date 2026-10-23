import { $ } from '../core/dom.js';
import { KEYS, write } from '../core/store.js';
import { state } from '../state.js';
import { slim } from '../ui/format.js';
import { dropCont, pushCont } from './sync.js';

export const contList = () => Object.values(state.cont)
  .filter(entry => entry && entry.item && !state.blocked.has(entry.item.key))
  .sort((a, b) => b.ts - a.ts);

export function contFlush(force) {
  const cur = state.cur;
  if (!cur || !(state.live.t >= 3)) return;
  const now = Date.now();
  if (!force && now - state.contAt < 5000) return;
  state.contAt = now;
  const entry = {
    item: slim(cur),
    ep: state.live.ep || null,
    season: state.live.season || null,
    t: state.live.t,
    dur: state.live.dur || 0,
    voice: state.curVoice ? state.curVoice.id : null,
    vname: state.curVoice ? state.curVoice.name : '',
    ts: now
  };
  if (state.live.dur && state.live.t > state.live.dur - 20) {
    if (cur.kind === 'anime' || (cur.eps && (state.live.ep || 1) >= cur.eps)) {
      delete state.cont[cur.key];
      dropCont(cur.key);
      write(KEYS.cont, state.cont);
      return;
    }
    entry.ep = (state.live.ep || 1) + 1;
    entry.t = 0;
  }
  state.cont[cur.key] = entry;
  contList().slice(20).forEach(old => {
    delete state.cont[old.item.key];
    dropCont(old.item.key);
  });
  write(KEYS.cont, state.cont);
  pushCont(cur.key, entry);
}

addEventListener('message', event => {
  const frame = $('#frame');
  if (!state.cur || !frame || event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.key === 'kodik_player_time_update') {
    state.live.t = Number(data.value) || 0;
    contFlush();
  } else if (data.key === 'kodik_player_duration_update') {
    state.live.dur = Number(data.value) || 0;
  } else if (data.key === 'kodik_player_current_episode') {
    const value = data.value;
    if (value && typeof value === 'object') {
      state.live.ep = Number(value.episode) || state.live.ep;
      state.live.season = Number(value.season) || state.live.season;
    } else if (value) {
      state.live.ep = Number(value);
    }
    state.live.t = 0;
  } else if (data.key === 'kodik_player_pause') {
    contFlush(true);
  }
});

addEventListener('pagehide', () => contFlush(true));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) contFlush(true);
});
