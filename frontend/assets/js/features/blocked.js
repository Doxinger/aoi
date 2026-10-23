import { api } from '../services/api.js';
import { state } from '../state.js';

export async function ensureBlocked() {
  if (state.blockedLoaded) return;
  state.blockedLoaded = true;
  try {
    state.blocked = new Set((await api('/api/blocked')).keys);
  } catch {}
}
