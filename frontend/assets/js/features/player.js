import { emit, on } from '../core/bus.js';
import { $, esc } from '../core/dom.js';
import { KEYS, read, write } from '../core/store.js';
import { toast } from '../core/toast.js';
import { api } from '../services/api.js';
import { state } from '../state.js';
import { merge, rate, statusOf } from '../ui/format.js';
import { contFlush } from './progress.js';
import { syncSaveButton, toggleSave } from './saved.js';

const HOSTS = /(^|\.)(kodikplayer\.com|kodik\.info|kodik\.biz|kodik\.cc|aniqit\.com)$/i;

function playUrl(raw, resume) {
  let url = String(raw || '').trim();
  if (url.startsWith('//')) url = 'https:' + url;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || !HOSTS.test(parsed.hostname)) return null;
    parsed.searchParams.set('translations', 'false');
    if (resume) {
      if (resume.season) parsed.searchParams.set('season', resume.season);
      if (resume.ep) parsed.searchParams.set('episode', resume.ep);
      if (resume.t > 5) parsed.searchParams.set('start_from', Math.floor(resume.t));
    }
    return parsed.href;
  } catch {
    return null;
  }
}

const syncPSave = item => syncSaveButton($('#pSave'), item);

function fill(item) {
  $('#pBar').textContent = item.title;
  $('#pTitle').textContent = item.title;
  $('#pOrig').textContent = [item.orig, item.year].filter(Boolean).join(' · ');
  $('#pCover').src = item.poster || '';
  $('#pCover').alt = item.title;
  $('#pRate').innerHTML = `<div>Кинопоиск<b>${rate(item.kp)}</b></div><div>IMDb<b>${rate(item.imdb)}</b></div>${item.shiki ? `<div>Оценка<b>${rate(item.shiki)}</b></div>` : ''}`;
  $('#pMeta').innerHTML = `<span>${esc(statusOf(item))}</span>${item.eps ? `<span>${item.eps} эп.</span>` : ''}`;
  $('#pDesc').textContent = item.desc || 'Описание пока не добавлено.';
  $('#pTags').innerHTML = (item.genres || []).map(genre => `<span class="tag">${esc(genre)}</span>`).join('');
  syncPSave(item);
}

const voiceButton = voice => `<button class="voice" data-id="${esc(voice.id)}"><span>${esc(voice.name)}</span><small>${voice.eps ? voice.eps + ' эп.' : 'Фильм'}${voice.quality ? ' · ' + esc(voice.quality) : ''}</small></button>`;

function play(voice, resume) {
  const url = voice && playUrl(voice.link, resume);
  if (!url) {
    toast('Не удалось открыть плеер');
    return false;
  }
  state.curVoice = voice;
  state.live = resume ? { ep: resume.ep, season: resume.season, t: resume.t, dur: resume.dur } : {};
  $('#frame').src = url;
  $('#plNote').hidden = true;
  $('#voices').querySelectorAll('.voice').forEach(button => button.classList.toggle('active', button.dataset.id === String(voice.id)));
  write(KEYS.voice(state.cur.key), voice.id);
  return true;
}

function showVoices(voices) {
  const dubs = voices.filter(voice => voice.type !== 'subtitles');
  const subs = voices.filter(voice => voice.type === 'subtitles');
  $('#voices').innerHTML = dubs.map(voiceButton).join('') +
    (subs.length ? '<div class="vh" style="width:100%;margin:14px 0 0">Субтитры</div>' + subs.map(voiceButton).join('') : '');
  $('#voices').querySelectorAll('.voice').forEach(button => {
    button.onclick = () => {
      const voice = voices.find(candidate => String(candidate.id) === button.dataset.id);
      if (play(voice)) toast('Озвучка: ' + voice.name);
    };
  });
}

export async function openPage(item, push = true, options = {}) {
  state.cur = item;
  state.curVoice = null;
  state.live = {};
  fill(item);
  $('#frame').src = 'about:blank';
  $('#plNote').textContent = 'Подбираем озвучки…';
  $('#plNote').hidden = false;
  $('#voices').innerHTML = '';
  $('#page').classList.add('open');
  $('#page').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if (push) history.pushState({ page: item.key }, '');
  try {
    const data = await api('/api/title?key=' + encodeURIComponent(item.key));
    if (state.cur !== item) return;
    if (data.item) {
      state.cur = merge({ ...item }, data.item);
      fill(state.cur);
    }
    const voices = (data.voices || []).filter(voice => playUrl(voice.link));
    if (!voices.length) {
      $('#plNote').textContent = 'Для этого аниме пока нет доступных озвучек.';
      return;
    }
    const entry = state.cont[state.cur.key];
    const preferred = entry && entry.voice != null ? entry.voice : read(KEYS.voice(state.cur.key), null);
    showVoices(voices);
    const voice = voices.find(candidate => String(candidate.id) === String(preferred)) || voices[0];
    if (options.details) {
      $('#plNote').textContent = 'Выберите озвучку, чтобы начать просмотр';
      requestAnimationFrame(() => $('#page .info').scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }
    play(voice, entry && String(entry.voice) === String(voice.id) ? entry : null);
  } catch (error) {
    if (state.cur === item) $('#plNote').textContent = error.message;
  }
}

export function hidePage() {
  contFlush(true);
  $('#page').classList.remove('open');
  $('#frame').src = 'about:blank';
  document.body.style.overflow = state.spOpen ? 'hidden' : '';
  state.cur = null;
  state.curVoice = null;
  emit('player:closed');
}

export const isPageOpen = () => $('#page').classList.contains('open');

$('#pBack').onclick = () => {
  if (history.state && history.state.page) history.back();
  else hidePage();
};

$('#pSave').onclick = () => state.cur && toggleSave(state.cur);

addEventListener('keydown', event => {
  if (event.key === 'Escape' && isPageOpen()) $('#pBack').click();
});

on('saved:changed', () => {
  if (state.cur) syncPSave(state.cur);
});
