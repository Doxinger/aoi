import { on } from '../core/bus.js';
import { $, esc } from '../core/dom.js';
import { KEYS, write } from '../core/store.js';
import { toast } from '../core/toast.js';
import { state } from '../state.js';
import { formatTime } from '../ui/format.js';
import { IC_TV, IC_X } from '../ui/icons.js';
import { fallbackPosters } from '../ui/poster.js';
import { openPage } from './player.js';
import { contList } from './progress.js';
import { dropCont } from './sync.js';

export function renderCont() {
  const box = $('#cont');
  const row = $('#contRow');
  const list = state.mode === 'popular' && !state.query ? contList() : [];
  box.hidden = !list.length;
  if (!list.length) {
    row.innerHTML = '';
    return;
  }
  row.innerHTML = list.map(entry => {
    const item = entry.item;
    const image = item.banner || item.poster;
    const percent = entry.dur ? Math.min(100, entry.t / entry.dur * 100) : 0;
    return `<article class="ccard" data-key="${esc(item.key)}" tabindex="0" role="button" aria-label="${esc('Продолжить: ' + item.title)}">
      ${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
      <div class="c-top"><span class="c-chip">${item.kind === 'anime' ? 'Фильм' : 'Серия ' + (entry.ep || 1)}</span>${entry.t > 0 ? `<span class="c-chip c-time">${formatTime(entry.t)}</span>` : ''}</div>
      <button class="c-x" data-del="${esc(item.key)}" aria-label="Убрать из истории">${IC_X}</button>
      <div class="c-body"><div class="c-title">${esc(item.title)}</div><div class="c-voice">${IC_TV}<span>${esc(entry.vname || 'Озвучка')}</span></div><div class="c-bar"><i style="width:${percent}%"></i></div></div></article>`;
  }).join('');
  fallbackPosters(row, 'img');
}

$('#contRow').addEventListener('click', event => {
  const remove = event.target.closest('[data-del]');
  if (remove) {
    delete state.cont[remove.dataset.del];
    dropCont(remove.dataset.del);
    write(KEYS.cont, state.cont);
    renderCont();
    toast('Убрано из истории');
    return;
  }
  const card = event.target.closest('.ccard');
  const entry = card && state.cont[card.dataset.key];
  if (entry) openPage(entry.item);
});

$('#contRow').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const card = event.target.closest('.ccard');
  const entry = card && state.cont[card.dataset.key];
  if (entry) openPage(entry.item);
});

$('#contPrev').onclick = () => $('#contRow').scrollBy({ left: -$('#contRow').clientWidth * 0.8, behavior: 'smooth' });
$('#contNext').onclick = () => $('#contRow').scrollBy({ left: $('#contRow').clientWidth * 0.8, behavior: 'smooth' });

on('player:closed', renderCont);
