import { $, esc } from '../core/dom.js';
import { KEYS, write } from '../core/store.js';
import { api } from '../services/api.js';
import { anilist, toCard } from '../services/anilist.js';
import { state } from '../state.js';
import { merge, rate, statusOf } from '../ui/format.js';
import { IC_CLOCK, STAR } from '../ui/icons.js';
import { fallbackPosters } from '../ui/poster.js';
import { openPage } from './player.js';

const overlay = $('#sp');
const input = $('#spInput');
const body = $('#spBody');
const head = $('#spHead');
const count = $('#spCount');
const clear = $('#spClear');

let debounce;

async function searchItems(query) {
  let list;
  if (/[а-яё]/i.test(query)) {
    const found = (await api('/api/find?q=' + encodeURIComponent(query))).items || [];
    const ids = found.map(item => Number(item.mal));
    const media = ids.length ? await anilist({ ids }) : [];
    list = ids.map(id => media.find(candidate => candidate.idMal === id)).filter(Boolean).map(toCard);
    list.forEach(item => {
      const brief = found.find(candidate => 's' + candidate.mal === item.key);
      if (brief) {
        merge(item, { title: brief.title, kp: brief.kp, imdb: brief.imdb });
        item.ru = 1;
      }
    });
  } else {
    list = (await anilist({ search: query })).map(toCard);
  }
  return list.filter(item => !state.blocked.has(item.key));
}

const resultInfo = item => {
  const rating = item.kp || item.imdb || item.shiki;
  return `<div class="sr-title">${esc(item.title)}</div><div class="sr-orig">${esc(item.orig || '')}</div>
    <div class="sr-tags">${rating ? `<span class="r">${STAR}${rate(rating)}</span>` : ''}${item.year ? `<span>${esc(item.year)}</span>` : ''}${(item.genres || []).slice(0, 2).map(genre => `<span>${esc(genre)}</span>`).join('')}</div>
    <div class="sr-foot"><span class="st ${esc(item.status || '')}">${esc(statusOf(item))}</span>${item.kind === 'anime' ? '<span class="sr-eps">Фильм</span>' : item.eps ? `<span class="sr-eps">${item.eps} эп.</span>` : ''}</div>`;
};

const resultCard = item => `<article class="sr" data-key="${esc(item.key)}" tabindex="0" role="button">${item.poster ? `<img class="sr-poster" src="${esc(item.poster)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="sr-poster"></div>'}<div class="sr-info">${resultInfo(item)}</div></article>`;

function updateResult(item) {
  const info = body.querySelector(`[data-key="${CSS.escape(item.key)}"] .sr-info`);
  if (info) info.innerHTML = resultInfo(item);
}

function renderResults(query) {
  head.hidden = !state.spItems.length;
  count.textContent = state.spItems.length;
  body.innerHTML = state.spItems.length
    ? `<div class="sp-list">${state.spItems.map(resultCard).join('')}</div>`
    : `<div class="sp-msg">Ничего не нашли по «${esc(query)}».<br>Проверьте написание или попробуйте название на английском.</div>`;
  fallbackPosters(body, 'img.sr-poster');
  overlay.scrollTop = 0;
}

async function enrichResults(list, requestId) {
  const need = list.filter(item => !item.ru).map(item => item.key.slice(1));
  if (!need.length) return;
  try {
    const data = await api('/api/ru?ids=' + need.join(','));
    list.forEach(item => {
      const result = data[item.key.slice(1)];
      if (result) {
        merge(item, { title: result.title, kp: result.kp, imdb: result.imdb });
        item.ru = 1;
        if (requestId === state.spReq) updateResult(item);
      }
    });
  } catch {}
}

export async function runSearch(query) {
  const requestId = ++state.spReq;
  let list = state.spCache.get(query);
  if (!list) {
    if (!state.spItems.length) {
      head.hidden = true;
      body.innerHTML = '<div class="sp-msg"><span class="spinner"></span>Ищем…</div>';
    }
    body.classList.add('busy');
    try {
      list = await searchItems(query);
      state.spCache.set(query, list);
    } catch (error) {
      if (requestId !== state.spReq) return;
      body.classList.remove('busy');
      head.hidden = true;
      body.innerHTML = `<div class="sp-msg">${esc(error.message)}<br><br><button class="secondary" id="spRetry" type="button">Попробовать снова</button></div>`;
      $('#spRetry').onclick = () => runSearch(query);
      return;
    }
  }
  if (requestId !== state.spReq) return;
  body.classList.remove('busy');
  state.spItems = list;
  renderResults(query);
  enrichResults(list, requestId);
}

export function showRecent() {
  body.classList.remove('busy');
  head.hidden = true;
  body.innerHTML = state.recent.length
    ? `<div class="sp-rh"><h3>Недавние запросы</h3><button id="rcClear" type="button">Очистить</button></div><div class="rc-list">${state.recent.map(query => `<button class="rc" type="button" data-q="${esc(query)}">${IC_CLOCK}<span>${esc(query)}</span></button>`).join('')}</div>`
    : '<div class="sp-msg">Начните вводить название — результаты появятся сразу, пока вы печатаете.</div>';
}

export function pushRecent(query) {
  if (!query) return;
  state.recent = [query, ...state.recent.filter(item => item.toLowerCase() !== query.toLowerCase())].slice(0, 8);
  write(KEYS.recent, state.recent);
}

export function openSearch() {
  if (state.spOpen) return;
  state.spOpen = true;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  history.pushState({ search: 1 }, '');
  input.value = '';
  clear.hidden = true;
  state.spItems = [];
  showRecent();
  input.focus();
}

export function closeSearch() {
  if (!state.spOpen) return;
  state.spOpen = false;
  state.spReq++;
  clearTimeout(debounce);
  overlay.classList.remove('open');
  input.blur();
  document.body.style.overflow = '';
  state.spItems = [];
}

input.addEventListener('input', () => {
  const query = input.value.trim();
  clear.hidden = !input.value;
  clearTimeout(debounce);
  state.spReq++;
  if (!query) {
    state.spItems = [];
    showRecent();
    return;
  }
  debounce = setTimeout(() => runSearch(query), 180);
});

input.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  clearTimeout(debounce);
  const query = input.value.trim();
  if (query) {
    pushRecent(query);
    runSearch(query);
    input.blur();
  }
});

clear.onclick = () => {
  input.value = '';
  input.dispatchEvent(new Event('input'));
  input.focus();
};

$('#spClose').onclick = () => {
  if (history.state && history.state.search) history.back();
  else closeSearch();
};

body.addEventListener('touchmove', () => {
  if (document.activeElement === input) input.blur();
}, { passive: true });

function pick(card) {
  const item = state.spItems.find(candidate => candidate.key === card.dataset.key);
  if (!item) return;
  pushRecent(input.value.trim());
  input.blur();
  openPage(item);
}

body.addEventListener('click', event => {
  const recentChip = event.target.closest('.rc');
  if (recentChip) {
    input.value = recentChip.dataset.q;
    input.dispatchEvent(new Event('input'));
    input.blur();
    return;
  }
  if (event.target.closest('#rcClear')) {
    state.recent = [];
    write(KEYS.recent, state.recent);
    showRecent();
    return;
  }
  const card = event.target.closest('.sr');
  if (card) pick(card);
});

body.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const card = event.target.closest('.sr');
  if (card) pick(card);
});

addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.spOpen && !$('#page').classList.contains('open')) $('#spClose').click();
});
