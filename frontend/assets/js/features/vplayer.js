import { $, esc } from '../core/dom.js';
import { KEYS, read, write } from '../core/store.js';
import { api } from '../services/api.js';
import { state } from '../state.js';
import { contFlush } from './progress.js';
import { checkEpisodeEnd, noteActivity } from './watchstats.js';

const vp = $('#vp');
const epBar = $('#epBar');
const plNote = $('#plNote');

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const SVG_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const SVG_PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
const SVG_BIG_PLAY = '<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const SVG_PREV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>';
const SVG_NEXT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>';
const SVG_VOL_HIGH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SVG_VOL_LOW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
const SVG_VOL_MUTE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
const SVG_FULL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
const SVG_FULL_EXIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
const SVG_PIP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor" stroke="none"/></svg>';

let hls = null;
let video = null;
let session = null;
let fallbackFn = null;
let hideTimer = 0;
let pendingStart = 0;
let pendingPlay = true;
let menuMode = null;
let seekDrag = false;
let els = {};
let built = false;
let fatalCount = 0;

const fmtTime = seconds => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

function build() {
  vp.innerHTML = `
    <video class="vp-video" playsinline preload="metadata"></video>
    <div class="vp-overlay">
      <button class="vp-big" data-act="play" type="button" aria-label="Смотреть">${SVG_BIG_PLAY}</button>
      <div class="vp-spin" hidden><span class="spinner"></span></div>
      <div class="vp-err" hidden>
        <p class="vp-err-text"></p>
        <div class="vp-err-actions">
          <button class="secondary vp-err-btn" data-act="retry" type="button">Повторить</button>
          <button class="secondary vp-err-btn" data-act="iframe" type="button">Открыть плеер Kodik</button>
        </div>
      </div>
    </div>
    <div class="vp-ui">
      <div class="vp-seek" data-act="seek">
        <div class="vp-track"><div class="vp-buffer"></div><div class="vp-fill"></div></div>
      </div>
      <div class="vp-row">
        <button class="vp-btn" data-act="prev" type="button" aria-label="Предыдущая серия">${SVG_PREV}</button>
        <button class="vp-btn" data-act="play" type="button" aria-label="Пуск или пауза">${SVG_PLAY}</button>
        <button class="vp-btn" data-act="next" type="button" aria-label="Следующая серия">${SVG_NEXT}</button>
        <span class="vp-time"><span class="vp-cur">0:00</span> / <span class="vp-dur">0:00</span></span>
        <div class="vp-vol">
          <button class="vp-btn" data-act="mute" type="button" aria-label="Звук">${SVG_VOL_HIGH}</button>
          <input class="vp-vol-range" type="range" min="0" max="1" step="0.05" value="1" data-act="vol" aria-label="Громкость">
        </div>
        <span class="vp-grow"></span>
        <button class="vp-btn vp-text" data-act="speed" type="button">1x</button>
        <button class="vp-btn vp-text" data-act="quality" type="button">…</button>
        <button class="vp-btn" data-act="pip" type="button" aria-label="Картинка в картинке">${SVG_PIP}</button>
        <button class="vp-btn" data-act="full" type="button" aria-label="Полный экран">${SVG_FULL}</button>
      </div>
    </div>
    <div class="vp-menu" hidden></div>`;
  video = vp.querySelector('.vp-video');
  els = {
    big: vp.querySelector('.vp-big'),
    spin: vp.querySelector('.vp-spin'),
    err: vp.querySelector('.vp-err'),
    errText: vp.querySelector('.vp-err-text'),
    seek: vp.querySelector('.vp-seek'),
    track: vp.querySelector('.vp-track'),
    buffer: vp.querySelector('.vp-buffer'),
    fill: vp.querySelector('.vp-fill'),
    cur: vp.querySelector('.vp-cur'),
    dur: vp.querySelector('.vp-dur'),
    mute: vp.querySelector('[data-act="mute"]'),
    vol: vp.querySelector('[data-act="vol"]'),
    speed: vp.querySelector('[data-act="speed"]'),
    quality: vp.querySelector('[data-act="quality"]'),
    pip: vp.querySelector('[data-act="pip"]'),
    full: vp.querySelector('[data-act="full"]'),
    menu: vp.querySelector('.vp-menu'),
    play: vp.querySelectorAll('[data-act="play"]')
  };
  if (!document.pictureInPictureEnabled) els.pip.hidden = true;
  wireVideo();
  wireControls();
  built = true;
}

function wireVideo() {
  video.addEventListener('timeupdate', () => {
    els.cur.textContent = fmtTime(video.currentTime);
    els.fill.style.width = video.duration ? `${(video.currentTime / video.duration) * 100}%` : '0%';
    state.live.t = video.currentTime;
    noteActivity();
    checkEpisodeEnd();
    contFlush();
  });
  video.addEventListener('durationchange', () => {
    if (video.duration > 0) {
      state.live.dur = video.duration;
      els.dur.textContent = fmtTime(video.duration);
    }
  });
  video.addEventListener('progress', () => {
    if (video.buffered.length && video.duration) {
      els.buffer.style.width = `${(video.buffered.end(video.buffered.length - 1) / video.duration) * 100}%`;
    }
  });
  video.addEventListener('play', () => setPlayIcon(true));
  video.addEventListener('playing', () => {
    setPlayIcon(true);
    els.spin.hidden = true;
    els.err.hidden = true;
    fatalCount = 0;
  });
  video.addEventListener('pause', () => {
    setPlayIcon(false);
    wakeUi();
  });
  video.addEventListener('waiting', () => {
    els.spin.hidden = false;
  });
  video.addEventListener('canplay', () => {
    els.spin.hidden = true;
  });
  video.addEventListener('volumechange', updateVolumeIcon);
  video.addEventListener('loadedmetadata', () => {
    applyPendingStart();
  });
  video.addEventListener('ended', () => {
    contFlush(true);
    playNext();
  });
  video.addEventListener('click', togglePlay);
}

function applyPendingStart() {
  if (pendingStart > 1 && video.duration) {
    video.currentTime = Math.min(pendingStart, Math.max(0, video.duration - 5));
  }
  pendingStart = 0;
  if (pendingPlay) video.play().catch(() => setPlayIcon(false));
}

function setPlayIcon(playing) {
  els.big.hidden = playing;
  els.play.forEach(button => {
    if (button !== els.big) button.innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
  });
  if (playing) scheduleHide();
  else wakeUi();
}

function wireControls() {
  vp.addEventListener('click', event => {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    if (act === 'play') togglePlay();
    else if (act === 'mute') toggleMute();
    else if (act === 'prev') playPrev();
    else if (act === 'next') playNext();
    else if (act === 'speed') openMenu('speed');
    else if (act === 'quality') openMenu('quality');
    else if (act === 'pip') togglePip();
    else if (act === 'full') toggleFull();
    else if (act === 'retry') retry();
    else if (act === 'iframe') toIframe();
  });
  els.vol.addEventListener('input', () => {
    video.volume = Number(els.vol.value);
    video.muted = video.volume === 0;
  });
  els.seek.addEventListener('pointerdown', event => {
    seekDrag = true;
    els.seek.setPointerCapture(event.pointerId);
    seekFromEvent(event);
  });
  els.seek.addEventListener('pointermove', event => {
    if (seekDrag) seekFromEvent(event);
  });
  els.seek.addEventListener('pointerup', () => {
    seekDrag = false;
  });
  els.menu.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.q) setQuality(Number(button.dataset.q));
    else if (button.dataset.speed) {
      video.playbackRate = Number(button.dataset.speed);
      els.speed.textContent = `${button.dataset.speed}x`;
      closeMenu();
    }
  });
  vp.addEventListener('mousemove', wakeUi);
  vp.addEventListener('touchstart', wakeUi, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    els.full.innerHTML = document.fullscreenElement ? SVG_FULL_EXIT : SVG_FULL;
  });
}

function seekFromEvent(event) {
  if (!video.duration) return;
  const rect = els.track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  video.currentTime = ratio * video.duration;
  els.fill.style.width = `${ratio * 100}%`;
}

function togglePlay() {
  if (!session) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

function toggleMute() {
  video.muted = !video.muted;
  els.vol.value = video.muted ? 0 : video.volume;
}

function updateVolumeIcon() {
  els.vol.value = video.muted ? 0 : video.volume;
  els.mute.innerHTML = video.muted || video.volume === 0 ? SVG_VOL_MUTE : video.volume < 0.5 ? SVG_VOL_LOW : SVG_VOL_HIGH;
}

function changeVolume(delta) {
  video.volume = Math.min(1, Math.max(0, video.volume + delta));
  video.muted = video.volume === 0;
}

function seekBy(seconds) {
  if (video.duration) video.currentTime = Math.min(video.duration - 1, Math.max(0, video.currentTime + seconds));
}

function togglePip() {
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  else video.requestPictureInPicture().catch(() => {});
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else (vp.requestFullscreen ? vp.requestFullscreen() : video.webkitEnterFullscreen && video.webkitEnterFullscreen());
}

function wakeUi() {
  vp.classList.remove('idle');
  clearTimeout(hideTimer);
  scheduleHide();
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (video && !video.paused && els.err.hidden) vp.classList.add('idle');
  }, 2600);
}

function openMenu(mode) {
  if (menuMode === mode) {
    closeMenu();
    return;
  }
  menuMode = mode;
  if (mode === 'quality') {
    els.menu.innerHTML = (session.qualities || [])
      .map(entry => `<button type="button" data-q="${entry.q}" class="${session.quality && entry.q === session.quality.q ? 'active' : ''}">${entry.q}p</button>`)
      .join('');
  } else {
    els.menu.innerHTML = SPEEDS
      .map(value => `<button type="button" data-speed="${value}" class="${video.playbackRate === value ? 'active' : ''}">${value}x</button>`)
      .join('');
  }
  els.menu.hidden = false;
  wakeUi();
}

function closeMenu() {
  menuMode = null;
  if (els.menu) els.menu.hidden = true;
}

document.addEventListener('click', event => {
  if (menuMode && !event.target.closest('.vp-menu') && !event.target.closest('[data-act="speed"]') && !event.target.closest('[data-act="quality"]')) closeMenu();
});

function pickQuality(qualities) {
  const pref = Number(read(KEYS.quality, 0));
  const sorted = [...qualities].sort((a, b) => b.q - a.q);
  if (pref) {
    const exact = sorted.find(entry => entry.q === pref);
    if (exact) return exact;
    const lower = sorted.filter(entry => entry.q <= pref);
    if (lower.length) return lower[0];
  }
  return sorted[0];
}

function setQuality(q) {
  const entry = (session.qualities || []).find(candidate => candidate.q === q);
  closeMenu();
  if (!entry || (session.quality && entry.q === session.quality.q)) return;
  write(KEYS.quality, entry.q);
  const at = video.currentTime;
  const playing = !video.paused;
  session.quality = entry;
  els.quality.textContent = `${entry.q}p`;
  attach(entry.url, at, playing);
}

function destroyHls() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

function attach(url, startAt, autoPlay) {
  destroyHls();
  pendingStart = startAt || 0;
  pendingPlay = autoPlay !== false;
  els.err.hidden = true;
  els.spin.hidden = false;
  fatalCount = 0;
  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({
      startLevel: -1,
      maxBufferLength: 60,
      maxMaxBufferLength: 240,
      manifestLoadingTimeOut: 20000,
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 5
    });
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      applyPendingStart();
    });
    hls.on(window.Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;
      fatalCount += 1;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && fatalCount <= 2) {
        hls.startLoad();
        return;
      }
      if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && fatalCount <= 2) {
        hls.recoverMediaError();
        return;
      }
      showFatal('Поток прервался. Попробуйте ещё раз или откройте плеер Kodik.');
    });
    hls.loadSource(url);
    hls.attachMedia(video);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
  } else {
    showFatal('Браузер не поддерживает воспроизведение HLS.');
  }
}

function showFatal(message) {
  els.spin.hidden = true;
  els.errText.textContent = message;
  els.err.hidden = false;
  wakeUi();
}

function retry() {
  if (!session || !session.quality) return;
  attach(session.quality.url, video.currentTime || pendingStart || 0, true);
}

function toIframe() {
  if (fallbackFn) fallbackFn();
}

function note(text) {
  plNote.textContent = text;
  plNote.hidden = false;
}

async function fetchPlay(link, season, ep) {
  const params = new URLSearchParams({ link });
  if (season) params.set('season', season);
  if (ep) params.set('ep', ep);
  return api('/api/kodik/play?' + params.toString());
}

function renderEpisodes() {
  const episodes = session.episodes || [];
  if (!episodes.length) {
    epBar.hidden = true;
    return;
  }
  const seasons = session.seasons && session.seasons.length ? session.seasons : [session.season || 1];
  const seasonHtml = seasons.length > 1
    ? `<div class="ep-seasons">${seasons.map(value => `<button class="ep-season${value === session.season ? ' active' : ''}" type="button" data-season="${value}">Сезон ${value}</button>`).join('')}</div>`
    : '';
  const list = episodes.filter(entry => entry.season === session.season);
  epBar.innerHTML = `${seasonHtml}<div class="ep-scroll">${list
    .map(entry => `<button class="ep-chip${entry.ep === session.ep ? ' active' : ''}" type="button" data-ep="${entry.ep}" title="${esc(entry.title || '')}">${entry.ep}</button>`)
    .join('')}</div>`;
  epBar.hidden = false;
  epBar.querySelectorAll('.ep-chip').forEach(chip =>
    chip.addEventListener('click', () => switchEpisode(session.season, Number(chip.dataset.ep)))
  );
  epBar.querySelectorAll('.ep-season').forEach(tab =>
    tab.addEventListener('click', () => switchSeason(Number(tab.dataset.season)))
  );
  const active = epBar.querySelector('.ep-chip.active');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function markCurrent() {
  epBar.querySelectorAll('.ep-chip').forEach(chip =>
    chip.classList.toggle('active', Number(chip.dataset.ep) === session.ep)
  );
}

export async function openCustom(link, resume, fallback) {
  if (!built) build();
  fallbackFn = fallback;
  session = { link, resume };
  vp.hidden = false;
  $('#frame').hidden = true;
  note('Запускаем плеер…');
  let data;
  try {
    data = await fetchPlay(link, resume && resume.season, resume && resume.ep);
  } catch {
    plNote.hidden = true;
    return false;
  }
  if (!data.qualities || !data.qualities.length) {
    plNote.hidden = true;
    return false;
  }
  session = {
    link,
    qualities: data.qualities,
    episodes: data.episodes || [],
    seasons: data.seasons || [],
    season: data.current ? data.current.season : (resume && resume.season) || 1,
    ep: data.current ? data.current.ep : (resume && resume.ep) || null,
    quality: pickQuality(data.qualities)
  };
  if (session.ep) {
    state.live.ep = session.ep;
    state.live.season = session.season;
  }
  els.quality.textContent = `${session.quality.q}p`;
  renderEpisodes();
  plNote.hidden = true;
  const sameSpot = resume && resume.ep === session.ep && (!resume.season || resume.season === session.season);
  attach(session.quality.url, sameSpot ? resume.t || 0 : 0, true);
  return true;
}

async function switchEpisode(season, ep) {
  if (!session) return;
  contFlush(true);
  session.season = season;
  session.ep = ep;
  state.live.ep = ep;
  state.live.season = season;
  state.live.t = 0;
  markCurrent();
  note('Загружаем серию…');
  try {
    const data = await fetchPlay(session.link, season, ep);
    session.qualities = data.qualities;
    if (data.current) {
      session.ep = data.current.ep;
      session.season = data.current.season;
      state.live.ep = session.ep;
      state.live.season = session.season;
    }
    if (data.episodes && data.episodes.length) {
      session.episodes = data.episodes;
      session.seasons = data.seasons && data.seasons.length ? data.seasons : session.seasons;
      renderEpisodes();
    } else {
      markCurrent();
    }
    const quality = pickQuality(data.qualities);
    session.quality = quality;
    els.quality.textContent = `${quality.q}p`;
    plNote.hidden = true;
    attach(quality.url, 0, true);
  } catch {
    showFatal('Серия не загрузилась. Попробуйте ещё раз или откройте плеер Kodik.');
  }
}

async function switchSeason(season) {
  if (!session || season === session.season) return;
  contFlush(true);
  session.season = season;
  state.live.season = season;
  note('Загружаем сезон…');
  try {
    const data = await fetchPlay(session.link, season, null);
    session.qualities = data.qualities;
    session.episodes = data.episodes || [];
    session.seasons = data.seasons && data.seasons.length ? data.seasons : session.seasons;
    if (data.current) {
      session.ep = data.current.ep;
      state.live.ep = session.ep;
      state.live.season = session.season;
    }
    renderEpisodes();
    const quality = pickQuality(data.qualities);
    session.quality = quality;
    els.quality.textContent = `${quality.q}p`;
    plNote.hidden = true;
    attach(quality.url, 0, true);
  } catch {
    plNote.hidden = true;
    showFatal('Сезон не загрузился.');
  }
}

function stepEpisode(delta) {
  if (!session || !session.episodes || !session.episodes.length) return;
  const list = session.episodes.filter(entry => entry.season === session.season);
  const index = list.findIndex(entry => entry.ep === session.ep);
  const next = list[index + delta];
  if (next) switchEpisode(next.season, next.ep);
  else if (delta > 0) {
    const nextSeason = (session.seasons || []).find(value => value > session.season);
    if (nextSeason) switchSeason(nextSeason);
  }
}

const playNext = () => stepEpisode(1);
const playPrev = () => stepEpisode(-1);

export function closeCustom() {
  destroyHls();
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  session = null;
  fallbackFn = null;
  vp.hidden = true;
  epBar.hidden = true;
  if (built) closeMenu();
}

export function isCustomActive() {
  return Boolean(session) && !vp.hidden;
}

document.addEventListener('keydown', event => {
  if (!isCustomActive()) return;
  const page = $('#page');
  if (!page || !page.classList.contains('open')) return;
  const tag = (event.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || event.target.isContentEditable) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.key) {
    case ' ':
    case 'k':
      event.preventDefault();
      togglePlay();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      seekBy(-10);
      wakeUi();
      break;
    case 'ArrowRight':
      event.preventDefault();
      seekBy(10);
      wakeUi();
      break;
    case 'ArrowUp':
      event.preventDefault();
      changeVolume(0.1);
      break;
    case 'ArrowDown':
      event.preventDefault();
      changeVolume(-0.1);
      break;
    case 'm':
      toggleMute();
      break;
    case 'f':
      toggleFull();
      break;
    default:
      break;
  }
});
