import { KEYS, read } from './core/store.js';

export const state = {
  mode: 'popular',
  genre: 'all',
  query: '',
  items: [],
  user: null,
  blocked: new Set(),
  blockedLoaded: false,
  reqId: 0,
  heroItem: null,
  heroList: [],
  heroIdx: 0,
  heroTimer: null,
  cur: null,
  curVoice: null,
  live: {},
  contAt: 0,
  spOpen: false,
  spReq: 0,
  spItems: [],
  spCache: new Map(),
  recent: read(KEYS.recent, []),
  saved: read(KEYS.saved, {}),
  cont: read(KEYS.cont, {})
};
