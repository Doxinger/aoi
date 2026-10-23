import { authApi } from '../services/auth.js';
import { state } from '../state.js';

export const pushSaved = (key, item) => {
  if (state.user) authApi.putSaved(key, item).catch(() => {});
};

export const dropSaved = key => {
  if (state.user) authApi.delSaved(key).catch(() => {});
};

export const pushCont = (key, entry) => {
  if (state.user) authApi.putCont(key, entry).catch(() => {});
};

export const dropCont = key => {
  if (state.user) authApi.delCont(key).catch(() => {});
};
