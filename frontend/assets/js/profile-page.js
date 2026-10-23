import { $, esc } from './core/dom.js';
import { toast } from './core/toast.js';
import { authApi, profileApi } from './services/auth.js';

const root = $('#pfRoot');
const acctWrap = $('#pfAcctWrap');
const navTitle = $('#pfNavTitle');
const fileInput = $('#pfFile');

const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const USER_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>';

let me = null;
let busyButton = null;

const fmtDate = iso => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

const fmtShort = ts => {
  const date = new Date(Number(ts));
  if (!ts || Number.isNaN(date.getTime())) return '—';
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

const fmtWatch = seconds => {
  const total = Number(seconds) || 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) return `${hours} ч`;
  if (minutes > 0) return `${minutes} мин`;
  return total > 0 ? '<1 мин' : '0 мин';
};

function showError(box, message) {
  box.textContent = message;
  box.hidden = false;
}

function busy(button, on) {
  button.disabled = on;
  if (on) busyButton = button;
  else if (busyButton === button) busyButton = null;
}

function renderAcct() {
  if (me) {
    const letter = me.username.charAt(0).toUpperCase();
    const ava = me.avatar ? `<img src="${esc(me.avatar)}" alt="">` : esc(letter);
    acctWrap.innerHTML = `
      <button class="acct" id="pfAcctBtn" type="button" aria-label="Аккаунт"><span class="acct-ava">${ava}</span><span class="acct-name">${esc(me.username)}</span></button>
      <div class="acct-menu" id="pfAcctMenu" hidden>
        <div class="acct-head">
          <span class="acct-ava">${ava}</span>
          <div class="acct-id"><div class="acct-menu-name">${esc(me.username)}</div><div class="acct-menu-mail">${esc(me.email)}</div></div>
        </div>
        <a class="acct-item" href="/">На главную</a>
        <button class="acct-logout" id="pfLogoutBtn" type="button">Выйти</button>
      </div>`;
    $('#pfAcctBtn').addEventListener('click', () => {
      $('#pfAcctMenu').hidden = !$('#pfAcctMenu').hidden;
    });
    $('#pfLogoutBtn').addEventListener('click', async () => {
      try {
        await authApi.logout();
      } catch {}
      location.href = '/';
    });
  } else {
    acctWrap.innerHTML = `<a class="acct" href="/?auth=login">${USER_ICON}<span class="acct-name">Войти</span></a>`;
  }
}

document.addEventListener('click', event => {
  const menu = $('#pfAcctMenu');
  if (menu && !menu.hidden && !event.target.closest('.acct-wrap')) menu.hidden = true;
});

function statsHtml(p) {
  const st = p.stats || {};
  return `
    <div class="pf-stat"><div class="pf-stat-num">${fmtWatch(st.watchSeconds)}</div><div class="pf-stat-label">просмотрено</div></div>
    <div class="pf-stat"><div class="pf-stat-num">${st.anime || 0}</div><div class="pf-stat-label">аниме</div></div>
    <div class="pf-stat"><div class="pf-stat-num">${st.episodes || 0}</div><div class="pf-stat-label">серий</div></div>
    <div class="pf-stat"><div class="pf-stat-num">${st.saved || 0}</div><div class="pf-stat-label">в закладках</div></div>
    <div class="pf-stat"><div class="pf-stat-num">${st.cont || 0}</div><div class="pf-stat-label">в истории</div></div>
    <div class="pf-stat"><div class="pf-stat-num">${fmtShort(st.lastActivity)}</div><div class="pf-stat-label">последняя активность</div></div>`;
}

function renderOwn(p) {
  const letter = p.username.charAt(0).toUpperCase();
  const genres = (p.stats && p.stats.genres || []).map(genre =>
    `<span class="pf-genre">${esc(genre.name)}<b>${genre.count}</b></span>`).join('');
  root.innerHTML = `
    <section class="pf-hero">
      <div class="pf-ava-col">
        <button class="pf-ava" id="pfAvaBtn" type="button" aria-label="Сменить аватар">
          ${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(letter)}
          <span class="pf-ava-hint">Сменить фото</span>
        </button>
        <button class="pf-mini" id="pfRemoveAva" type="button" ${p.avatar ? '' : 'hidden'}>Удалить фото</button>
      </div>
      <div class="pf-id-col">
        <h1 class="pf-name">${esc(p.username)}</h1>
        <div class="pf-sub"><span><b>${esc(p.email)}</b></span><span>На сайте с ${fmtDate(p.createdAt)}</span></div>
        <div class="pf-actions">
          <a class="secondary pf-sm" href="/u/${encodeURIComponent(p.username)}">Публичная страница</a>
          <button class="secondary pf-sm" id="pfCopyLink" type="button">Скопировать ссылку</button>
        </div>
        <div class="auth-error" id="pfAvaError" role="alert" hidden></div>
      </div>
    </section>

    <section class="pf-stats">${statsHtml(p)}</section>
    ${genres ? `<section class="pf-card"><h2 class="pf-h">Любимые жанры</h2><div class="pf-genres">${genres}</div></section>` : ''}

    <section class="pf-card">
      <h2 class="pf-h">О себе</h2>
      <textarea class="pf-about" id="pfAbout" rows="4" maxlength="500" placeholder="Пара слов о вас: что смотрите, что любите…">${esc(p.about || '')}</textarea>
      <div class="pf-row">
        <span class="pf-count" id="pfCount">${(p.about || '').length}/500</span>
        <button class="primary pf-sm" id="pfAboutSave" type="button">Сохранить</button>
      </div>
      <div class="auth-error" id="pfAboutError" role="alert" hidden></div>
    </section>

    <section class="pf-card">
      <h2 class="pf-h">Смена пароля</h2>
      <form class="pf-form" id="pfPassForm" novalidate>
        <label class="auth-field"><span>Текущий пароль</span><input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" placeholder="••••••••" aria-label="Текущий пароль"></label>
        <label class="auth-field"><span>Новый пароль</span><input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Минимум 8 символов" aria-label="Новый пароль"></label>
        <label class="auth-field"><span>Повторите новый пароль</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="••••••••" aria-label="Повторите новый пароль"></label>
        <div class="auth-error" id="pfPassError" role="alert" hidden></div>
        <button class="primary" type="submit">Сменить пароль</button>
        <p class="pf-note">После смены пароля остальные устройства будут выведены из аккаунта.</p>
      </form>
    </section>

    <section class="pf-card">
      <h2 class="pf-h">Удаление аккаунта</h2>
      <p class="pf-note">Аккаунт, закладки и история просмотра будут удалены безвозвратно.</p>
      <label class="auth-field"><span>Пароль для подтверждения</span><input id="pfDeletePass" type="password" autocomplete="current-password" maxlength="128" placeholder="••••••••" aria-label="Пароль для подтверждения"></label>
      <div class="auth-error" id="pfDeleteError" role="alert" hidden></div>
      <button class="pf-del" id="pfDeleteBtn" type="button">Удалить аккаунт</button>
    </section>`;
  wireOwn(p);
}

async function reloadOwn() {
  const data = await profileApi.me();
  me = { ...me, avatar: data.profile.avatar };
  renderAcct();
  renderOwn(data.profile);
  return data.profile;
}

async function uploadAvatar(file) {
  const errorBox = $('#pfAvaError');
  errorBox.hidden = true;
  if (!TYPES.includes(file.type)) {
    showError(errorBox, 'Поддерживаются только изображения JPEG, PNG, GIF и WebP');
    return;
  }
  if (file.size > MAX_SIZE) {
    showError(errorBox, 'Изображение больше 5 МБ');
    return;
  }
  const avaBtn = $('#pfAvaBtn');
  busy(avaBtn, true);
  try {
    const form = new FormData();
    form.append('avatar', file);
    await profileApi.uploadAvatar(form);
    await reloadOwn();
    toast('Аватар обновлён');
  } catch (error) {
    showError($('#pfAvaError'), error.message);
  } finally {
    const fresh = $('#pfAvaBtn');
    if (fresh) busy(fresh, false);
  }
}

function wireOwn(p) {
  const avaBtn = $('#pfAvaBtn');
  avaBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) uploadAvatar(file);
  });
  $('#pfRemoveAva').addEventListener('click', async event => {
    const button = event.currentTarget;
    busy(button, true);
    try {
      await profileApi.removeAvatar();
      await reloadOwn();
      toast('Фото удалено');
    } catch (error) {
      showError($('#pfAvaError'), error.message);
      busy(button, false);
    }
  });
  $('#pfCopyLink').addEventListener('click', async () => {
    const link = `${location.origin}/u/${encodeURIComponent(p.username)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка скопирована');
    } catch {
      toast(link);
    }
  });

  const about = $('#pfAbout');
  const counter = $('#pfCount');
  about.addEventListener('input', () => {
    counter.textContent = `${about.value.length}/500`;
  });
  $('#pfAboutSave').addEventListener('click', async event => {
    const button = event.currentTarget;
    const errorBox = $('#pfAboutError');
    errorBox.hidden = true;
    busy(button, true);
    try {
      const data = await profileApi.update({ about: about.value });
      p.about = data.profile.about;
      toast('Профиль сохранён');
    } catch (error) {
      showError(errorBox, error.message);
    } finally {
      busy(button, false);
    }
  });

  const passForm = $('#pfPassForm');
  passForm.addEventListener('submit', async event => {
    event.preventDefault();
    const errorBox = $('#pfPassError');
    errorBox.hidden = true;
    const fields = Object.fromEntries(new FormData(passForm));
    const currentPassword = String(fields.currentPassword || '');
    const newPassword = String(fields.newPassword || '');
    const confirm = String(fields.confirmPassword || '');
    if (!currentPassword) {
      showError(errorBox, 'Введите текущий пароль');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      showError(errorBox, 'Новый пароль: от 8 до 128 символов');
      return;
    }
    if (newPassword !== confirm) {
      showError(errorBox, 'Пароли не совпадают');
      return;
    }
    const button = passForm.querySelector('button[type="submit"]');
    busy(button, true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      passForm.reset();
      toast('Пароль изменён');
    } catch (error) {
      showError(errorBox, error.message);
    } finally {
      busy(button, false);
    }
  });

  const deleteBtn = $('#pfDeleteBtn');
  const deletePass = $('#pfDeletePass');
  let armed = false;
  let armTimer;
  const disarm = () => {
    armed = false;
    clearTimeout(armTimer);
    deleteBtn.classList.remove('armed');
    deleteBtn.textContent = 'Удалить аккаунт';
  };
  deleteBtn.addEventListener('click', async () => {
    const errorBox = $('#pfDeleteError');
    errorBox.hidden = true;
    if (!armed) {
      if (!deletePass.value) {
        showError(errorBox, 'Введите пароль для подтверждения');
        return;
      }
      armed = true;
      deleteBtn.classList.add('armed');
      deleteBtn.textContent = 'Точно удалить? Нажмите ещё раз';
      armTimer = setTimeout(disarm, 8000);
      return;
    }
    clearTimeout(armTimer);
    busy(deleteBtn, true);
    try {
      await authApi.deleteAccount({ password: deletePass.value });
      location.href = '/';
    } catch (error) {
      showError(errorBox, error.message);
      disarm();
      busy(deleteBtn, false);
    }
  });
}

function renderPublic(p, isSelf) {
  const letter = p.username.charAt(0).toUpperCase();
  const st = p.stats || {};
  root.innerHTML = `
    <section class="pf-hero">
      <span class="pf-ava">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(letter)}</span>
      <div class="pf-id-col">
        <h1 class="pf-name">${esc(p.username)}</h1>
        <div class="pf-sub"><span>На сайте с ${fmtDate(p.createdAt)}</span></div>
        ${p.about ? `<p class="pf-about-view">${esc(p.about)}</p>` : ''}
        ${isSelf ? `<div class="pf-actions"><a class="secondary pf-sm" href="/profile">Редактировать профиль</a></div>` : ''}
      </div>
    </section>
    <section class="pf-stats">
      <div class="pf-stat"><div class="pf-stat-num">${fmtWatch(st.watchSeconds)}</div><div class="pf-stat-label">просмотрено</div></div>
      <div class="pf-stat"><div class="pf-stat-num">${st.anime || 0}</div><div class="pf-stat-label">аниме</div></div>
      <div class="pf-stat"><div class="pf-stat-num">${st.episodes || 0}</div><div class="pf-stat-label">серий</div></div>
      <div class="pf-stat"><div class="pf-stat-num">${st.saved || 0}</div><div class="pf-stat-label">в закладках</div></div>
      <div class="pf-stat"><div class="pf-stat-num">${st.cont || 0}</div><div class="pf-stat-label">в истории</div></div>
    </section>`;
}

function renderGuest() {
  root.innerHTML = `
    <section class="pf-card pf-guest">
      <h1>Профиль</h1>
      <p>Войдите в аккаунт, чтобы настроить профиль: аватар, описание, пароль — и следить за статистикой просмотра.</p>
      <div class="pf-actions">
        <a class="primary pf-sm" href="/?auth=login">Войти</a>
        <a class="secondary pf-sm" href="/?auth=register">Создать аккаунт</a>
      </div>
    </section>`;
}

function renderNotFound() {
  navTitle.textContent = '';
  document.title = 'Профиль не найден — АОИ';
  root.innerHTML = `
    <section class="pf-card pf-guest">
      <h1>Профиль не найден</h1>
      <p>Возможно, пользователь удалил аккаунт или ссылка неверна.</p>
      <div class="pf-actions"><a class="primary pf-sm" href="/">На главную</a></div>
    </section>`;
}

async function resolveMe() {
  try {
    return (await authApi.me()).user;
  } catch (error) {
    if (error.code === 'token_expired') {
      try {
        return (await authApi.refresh()).user;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function boot() {
  me = await resolveMe();
  renderAcct();
  const path = location.pathname;
  if (path === '/profile') {
    navTitle.textContent = 'Профиль';
    if (!me) {
      renderGuest();
      return;
    }
    try {
      const data = await profileApi.me();
      me = { ...me, avatar: data.profile.avatar };
      renderAcct();
      document.title = `${data.profile.username} — АОИ`;
      navTitle.textContent = data.profile.username;
      renderOwn(data.profile);
    } catch (error) {
      root.innerHTML = `<div class="pf-loading">${esc(error.message)}</div>`;
    }
    return;
  }
  if (path.startsWith('/u/')) {
    let value;
    try {
      value = decodeURIComponent(path.slice(3));
    } catch {
      renderNotFound();
      return;
    }
    if (!value || value.includes('/')) {
      renderNotFound();
      return;
    }
    try {
      const data = await profileApi.byUsername(value);
      const p = data.profile;
      document.title = `${p.username} — АОИ`;
      navTitle.textContent = p.username;
      renderPublic(p, Boolean(me && me.id === p.id));
    } catch (error) {
      if (error.status === 404) renderNotFound();
      else root.innerHTML = `<div class="pf-loading">${esc(error.message)}</div>`;
    }
    return;
  }
  renderNotFound();
}

boot();
