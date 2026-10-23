import { on } from '../core/bus.js';
import { $, esc } from '../core/dom.js';
import { api } from '../services/api.js';
import { anilist, toCard } from '../services/anilist.js';
import { state } from '../state.js';
import { merge, rate, statusOf } from '../ui/format.js';
import { bookmarkIcon } from '../ui/icons.js';
import { fallbackPosters } from '../ui/poster.js';
import { ensureBlocked } from './blocked.js';
import { renderCont } from './continue.js';
import { initHero, setHero } from './hero.js';
import { openPage } from './player.js';
import { contList } from './progress.js';
import { isSaved, toggleSave } from './saved.js';

const grid = $('#grid');

const scoreHtml = item => `${item.kp ? `<span>КП ${rate(item.kp)}</span>` : ''}${item.imdb ? `<span>IMDb ${rate(item.imdb)}</span>` : ''}${!item.kp && !item.imdb && item.shiki ? `<span>★ ${rate(item.shiki)}</span>` : ''}`;

function updateCard(item) {
  const card = grid.querySelector(`[data-key="${CSS.escape(item.key)}"]`);
  if (card) {
    card.querySelector('.card-title').textContent = item.title;
    card.querySelector('.card-title').title = item.title;
    card.querySelector('.score').innerHTML = scoreHtml(item);
  }
  if (state.heroItem && state.heroItem.key === item.key) setHero(item);
}

async function enrich(list) {
  const need = list.filter(item => !item.ru).map(item => item.key.slice(1));
  if (!need.length) return;
  try {
    const data = await api('/api/ru?ids=' + need.join(','));
    list.forEach(item => {
      const result = data[item.key.slice(1)];
      if (result) {
        merge(item, { title: result.title, kp: result.kp, imdb: result.imdb });
        item.ru = 1;
        updateCard(item);
      }
    });
  } catch {}
}

function heads(title, subtitle) {
  $('#sectionTitle').textContent = title;
  $('#sectionSubtitle').textContent = subtitle;
}

const EMPTY_TEXT = {
  saved: 'Пока нет закладок. Нажмите на значок закладки у понравившегося аниме.',
  history: 'История пуста. Начните смотреть — и здесь появится место, где вы остановились.',
  catalog: 'Ничего не найдено. Попробуйте другое название или жанр.'
};

export function render() {
  const list = state.items;
  $('#countLabel').textContent = `${list.length} аниме`;
  if (!list.length) {
    const text = EMPTY_TEXT[state.mode] || EMPTY_TEXT.catalog;
    grid.innerHTML = `<div class="empty">${text}</div>`;
    return;
  }
  grid.innerHTML = list.map((item, index) => `<article class="card" data-key="${esc(item.key)}" style="animation-delay:${Math.min(index, 12) * 25}ms">
    <div class="poster-wrap">
      ${item.poster ? `<img class="poster" src="${esc(item.poster)}" alt="${esc(item.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<div class="poster"></div>'}
      <div class="score">${scoreHtml(item)}</div>
      <button class="save ${isSaved(item.key) ? 'saved' : ''}" data-save="${esc(item.key)}" aria-label="Закладки">${bookmarkIcon(isSaved(item.key))}</button>
    </div>
    <div class="card-title" title="${esc(item.title)}">${esc(item.title)}</div>
    <div class="card-sub"><span>${esc(statusOf(item))}</span><span>${esc(item.year || '')}</span></div></article>`).join('');
  fallbackPosters(grid, 'img.poster');
  grid.querySelectorAll('.card').forEach((card, index) => card.addEventListener('click', event => {
    if (event.target.closest('[data-save]')) {
      toggleSave(list[index]);
      return;
    }
    openPage(list[index]);
  }));
}

async function loadRussian(query) {
  const found = (await api('/api/find?q=' + encodeURIComponent(query))).items || [];
  const ids = found.map(item => Number(item.mal));
  const media = ids.length ? await anilist({ ids }) : [];
  const list = ids.map(id => media.find(item => item.idMal === id)).filter(Boolean).map(toCard);
  list.forEach(item => {
    const brief = found.find(candidate => 's' + candidate.mal === item.key);
    if (brief) {
      merge(item, { title: brief.title, kp: brief.kp, imdb: brief.imdb });
      item.ru = 1;
    }
  });
  return list;
}

export async function load() {
  const id = ++state.reqId;
  renderCont();
  $('#filters').hidden = state.mode === 'saved' || state.mode === 'history';
  await ensureBlocked();
  if (state.mode === 'saved') {
    state.items = Object.values(state.saved).filter(item => !state.blocked.has(item.key));
    heads('Ваши закладки', 'Сохранённые истории');
    render();
    return;
  }
  if (state.mode === 'history') {
    state.items = contList().map(entry => entry.item);
    heads('История просмотра', 'Всё, что вы начали смотреть');
    render();
    return;
  }
  grid.innerHTML = '<div class="loading"><span class="spinner"></span>Загружаем каталог…</div>';
  heads(
    state.query ? 'Результаты поиска' : state.mode === 'ongoing' ? 'Онгоинги' : 'Популярное аниме',
    state.query ? `По запросу «${state.query}»` : state.mode === 'ongoing' ? 'Новые серии выходят прямо сейчас' : 'Истории, которые стоит посмотреть'
  );
  try {
    let list;
    if (/[а-яё]/i.test(state.query)) {
      list = await loadRussian(state.query);
    } else {
      list = (await anilist({
        search: state.query,
        sort: state.query ? undefined : [state.mode === 'ongoing' ? 'TRENDING_DESC' : 'POPULARITY_DESC'],
        status: state.mode === 'ongoing' && !state.query ? 'RELEASING' : undefined,
        genre: state.genre === 'all' ? undefined : state.genre
      })).map(toCard);
    }
    if (id !== state.reqId) return;
    state.items = list.filter(item => !state.blocked.has(item.key));
    render();
    if (!state.heroItem && !state.query && state.items.length) initHero(state.items);
    enrich(state.items);
  } catch (error) {
    if (id !== state.reqId) return;
    grid.innerHTML = `<div class="empty">${esc(error.message)}<br><br><button class="secondary" id="retry">Попробовать снова</button></div>`;
    $('#retry').onclick = load;
  }
}

on('saved:changed', () => {
  if (state.mode === 'saved') load();
  else render();
});
