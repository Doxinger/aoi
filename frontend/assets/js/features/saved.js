import { emit } from '../core/bus.js';
import { KEYS, write } from '../core/store.js';
import { toast } from '../core/toast.js';
import { state } from '../state.js';
import { bookmarkIcon } from '../ui/icons.js';
import { dropSaved, pushSaved } from './sync.js';

export const isSaved = key => Boolean(state.saved[key]);

export function toggleSave(item) {
  if (state.saved[item.key]) {
    delete state.saved[item.key];
    dropSaved(item.key);
    toast('Удалено из закладок');
  } else {
    state.saved[item.key] = item;
    pushSaved(item.key, item);
    toast('Добавлено в закладки');
  }
  write(KEYS.saved, state.saved);
  emit('saved:changed', item);
}

export function syncSaveButton(button, item) {
  const on = Boolean(state.saved[item.key]);
  button.innerHTML = bookmarkIcon(on).replace('width="16" height="16"', 'width="20" height="20"');
  button.classList.toggle('saved', on);
  button.setAttribute('aria-label', on ? 'Убрать из закладок' : 'Добавить в закладки');
}
