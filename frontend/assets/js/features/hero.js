import { on } from '../core/bus.js';
import { $, $$, esc } from "../core/dom.js";
import { api } from '../services/api.js';
import { state } from '../state.js';
import { merge, rate, statusOf } from '../ui/format.js';
import { STAR } from '../ui/icons.js';
import { openPage } from './player.js';
import { syncSaveButton, toggleSave } from './saved.js';

const isMobile = () => matchMedia('(max-width:700px)').matches;

export function setHero(item) {
  state.heroItem = item;
  const background = isMobile() ? (item.poster || item.banner) : (item.banner || item.poster);
  $('#heroBg').style.backgroundImage = background ? `url("${background.replace(/["\\]/g, '')}")` : 'none';
  $('#heroTitle').textContent = item.title;
  $('#heroDesc').textContent = (item.desc || '').slice(0, 220);
  const rating = item.kp || item.imdb || item.shiki;
  $('#heroMeta').innerHTML = `${rating ? `<span class="m-rate">${STAR}${rate(rating)}</span>` : ''}<span>${esc(statusOf(item))}</span>${item.year ? `<span>${esc(item.year)}</span>` : ''}${item.eps ? `<span>${item.eps} эп.</span>` : ''}`;
  syncSaveButton($('#heroSave'), item);
  if (!item._info) {
    item._info = true;
    api('/api/info?key=' + encodeURIComponent(item.key))
      .then(data => {
        if (state.heroItem === item) setHero(merge(item, data));
      })
      .catch(() => {});
  }
}

const updateDots = () => $$('#heroDots .dot').forEach((dot, index) => dot.classList.toggle('on', index === state.heroIdx));

function rotate() {
  clearInterval(state.heroTimer);
  state.heroTimer = setInterval(() => {
    if (!state.cur && !state.spOpen && !document.hidden) goHero(state.heroIdx + 1);
  }, 8000);
}

export function goHero(index) {
  if (state.heroList.length < 2) return;
  state.heroIdx = (index + state.heroList.length) % state.heroList.length;
  updateDots();
  const content = $('#heroContent');
  const background = $('#heroBg');
  content.classList.add('swap');
  background.classList.add('swap');
  setTimeout(() => {
    setHero(state.heroList[state.heroIdx]);
    content.classList.remove('swap');
    background.classList.remove('swap');
  }, 180);
  rotate();
}

export function initHero(list) {
  state.heroList = list.filter(item => item.banner).concat(list.filter(item => !item.banner)).slice(0, 5);
  state.heroIdx = 0;
  setHero(state.heroList[0]);
  $('#heroDots').innerHTML = state.heroList
    .map((_, index) => `<button class="dot" data-i="${index}" aria-label="Слайд ${index + 1}"></button>`)
    .join('');
  updateDots();
  rotate();
}

$('#heroDots').addEventListener('click', event => {
  const dot = event.target.closest('.dot');
  if (dot) goHero(Number(dot.dataset.i));
});

let touchX = 0;
const heroEl = $('.hero');

heroEl.addEventListener('touchstart', event => {
  touchX = event.touches[0].clientX;
}, { passive: true });

heroEl.addEventListener('touchend', event => {
  const dx = event.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) goHero(state.heroIdx + (dx < 0 ? 1 : -1));
}, { passive: true });

$('#heroSave').onclick = () => state.heroItem && toggleSave(state.heroItem);
$('#heroWatch').onclick = () => state.heroItem && openPage(state.heroItem);
$('#heroMore').onclick = () => state.heroItem && openPage(state.heroItem, true, { details: true });

on('saved:changed', () => {
  if (state.heroItem) setHero(state.heroItem);
});
