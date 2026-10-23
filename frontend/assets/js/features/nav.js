import { $, $$ } from '../core/dom.js';
import { state } from '../state.js';
import { load } from './catalog.js';
import { openSearch } from './search.js';

let searchDebounce;

export function setMode(mode) {
  state.mode = mode;
  $$('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === mode));
  $$('[data-dock]').forEach(button => button.classList.toggle('active', button.dataset.dock === mode));
  load();
}

export function resetQuery() {
  state.query = '';
  $('#search').value = '';
}

$$('[data-mode]').forEach(button => {
  button.onclick = () => {
    resetQuery();
    setMode(button.dataset.mode);
  };
});

$$('[data-genre]').forEach(button => {
  button.onclick = () => {
    state.genre = button.dataset.genre;
    $$('[data-genre]').forEach(other => other.classList.toggle('active', other === button));
    load();
  };
});

$$('[data-dock]').forEach(button => {
  button.onclick = () => {
    const target = button.dataset.dock;
    if (target === 'search') {
      openSearch();
      return;
    }
    resetQuery();
    setMode(target);
    if (target === 'popular') scrollTo({ top: 0 });
  };
});

$('#search').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.query = $('#search').value.trim();
    if (state.mode === 'saved' || state.mode === 'history') state.mode = 'popular';
    setMode(state.mode);
  }, 350);
});

$('#search').addEventListener('focus', () => {
  $('#search').blur();
  openSearch();
});
