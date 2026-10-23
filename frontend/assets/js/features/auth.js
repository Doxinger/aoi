import { emit } from '../core/bus.js';
import { $, $$, esc } from '../core/dom.js';
import { KEYS, write } from '../core/store.js';
import { toast } from '../core/toast.js';
import { authApi } from '../services/auth.js';
import { state } from '../state.js';
import { bookmarkIcon } from '../ui/icons.js';
import { load } from './catalog.js';
import { renderCont } from './continue.js';
import { contList } from './progress.js';

const modal = $('#authModal');
const acctBtn = $('#acctBtn');
const acctMenu = $('#acctMenu');
const loginForm = $('#loginForm');
const registerForm = $('#registerForm');
const loginError = $('#loginError');
const registerError = $('#registerError');

const USERNAME_RE = /^[A-Za-zА-Яа-яЁё0-9_]{3,32}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;
const USER_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>';

function setTab(tab) {
  $$('.auth-tab').forEach(button => button.classList.toggle('active', button.dataset.atab === tab));
  loginForm.hidden = tab !== 'login';
  registerForm.hidden = tab !== 'register';
  loginError.hidden = true;
  registerError.hidden = true;
}

export function openAuth(tab = 'login') {
  setTab(tab);
  modal.hidden = false;
  document.body.classList.add('auth-open');
  const input = (tab === 'login' ? loginForm : registerForm).querySelector('input');
  setTimeout(() => input && input.focus(), 60);
}

function closeAuth() {
  modal.hidden = true;
  document.body.classList.remove('auth-open');
}

export function renderAccount() {
  if (state.user) {
    const letter = state.user.username.charAt(0).toUpperCase();
    acctBtn.innerHTML = `<span class="acct-ava">${esc(letter)}</span><span class="acct-name">${esc(state.user.username)}</span>`;
    acctBtn.setAttribute('aria-label', 'Аккаунт');
    $('#menuAva').textContent = letter;
    $('#menuName').textContent = state.user.username;
    $('#menuMail').textContent = state.user.email;
  } else {
    acctBtn.innerHTML = `${USER_ICON}<span class="acct-name">Войти</span>`;
    acctBtn.setAttribute('aria-label', 'Войти');
    acctMenu.hidden = true;
  }
}

function showFormError(box, message) {
  box.textContent = message;
  box.hidden = false;
}

function busy(form, on) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = on;
  button.classList.toggle('busy', on);
}

async function mergeFromServer() {
  let remote;
  try {
    remote = await authApi.data();
  } catch {
    return;
  }
  const remoteSaved = remote.saved || {};
  const remoteCont = remote.cont || {};
  const savedPatch = {};
  const contPatch = {};
  let changed = false;
  for (const [key, item] of Object.entries(remoteSaved)) {
    if (!state.saved[key]) {
      state.saved[key] = item;
      changed = true;
    }
  }
  for (const [key, entry] of Object.entries(remoteCont)) {
    const local = state.cont[key];
    if (!local || (entry.ts || 0) > (local.ts || 0)) {
      state.cont[key] = entry;
      changed = true;
    }
  }
  for (const [key, item] of Object.entries(state.saved)) {
    if (!(key in remoteSaved)) savedPatch[key] = item;
  }
  for (const [key, entry] of Object.entries(state.cont)) {
    const remoteEntry = remoteCont[key];
    if (!remoteEntry || (entry.ts || 0) > (remoteEntry.ts || 0)) contPatch[key] = entry;
  }
  contList().slice(20).forEach(old => {
    delete state.cont[old.item.key];
    contPatch[old.item.key] = null;
    changed = true;
  });
  if (changed) {
    write(KEYS.saved, state.saved);
    write(KEYS.cont, state.cont);
  }
  $$('#grid [data-save]').forEach(button => {
    const on = Boolean(state.saved[button.dataset.save]);
    button.classList.toggle('saved', on);
    button.innerHTML = bookmarkIcon(on);
  });
  emit('saved:changed');
  if (Object.keys(savedPatch).length || Object.keys(contPatch).length) {
    authApi.sync({ saved: savedPatch, cont: contPatch }).catch(() => {});
  }
  if (state.mode === 'saved' || state.mode === 'history') load();
  else renderCont();
}

async function afterAuth(user, greeting) {
  state.user = user;
  closeAuth();
  renderAccount();
  toast(greeting);
  emit('auth:changed', user);
  await mergeFromServer();
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.hidden = true;
  const fields = Object.fromEntries(new FormData(loginForm));
  const login = String(fields.login || '').trim();
  const password = String(fields.password || '');
  if (!login || !password) {
    showFormError(loginError, 'Введите логин и пароль');
    return;
  }
  busy(loginForm, true);
  try {
    const data = await authApi.login({ login, password });
    loginForm.reset();
    await afterAuth(data.user, `С возвращением, ${data.user.username}!`);
  } catch (error) {
    showFormError(loginError, error.message);
  } finally {
    busy(loginForm, false);
  }
});

registerForm.addEventListener('submit', async event => {
  event.preventDefault();
  registerError.hidden = true;
  const fields = Object.fromEntries(new FormData(registerForm));
  const username = String(fields.username || '').trim();
  const email = String(fields.email || '').trim();
  const password = String(fields.password || '');
  if (!USERNAME_RE.test(username)) {
    showFormError(registerError, 'Имя: 3–32 символа, буквы, цифры и знак _');
    return;
  }
  if (!EMAIL_RE.test(email)) {
    showFormError(registerError, 'Некорректный адрес почты');
    return;
  }
  if (password.length < 8 || password.length > 128) {
    showFormError(registerError, 'Пароль: от 8 до 128 символов');
    return;
  }
  busy(registerForm, true);
  try {
    const data = await authApi.register({ username, email, password });
    registerForm.reset();
    await afterAuth(data.user, `Аккаунт создан. Добро пожаловать, ${data.user.username}!`);
  } catch (error) {
    showFormError(registerError, error.message);
  } finally {
    busy(registerForm, false);
  }
});

acctBtn.addEventListener('click', () => {
  if (!state.user) {
    openAuth('login');
    return;
  }
  acctMenu.hidden = !acctMenu.hidden;
});

$('#logoutBtn').addEventListener('click', async () => {
  acctMenu.hidden = true;
  try {
    await authApi.logout();
  } catch {}
  state.user = null;
  renderAccount();
  toast('Вы вышли из аккаунта');
  emit('auth:changed', null);
  if (state.mode === 'saved' || state.mode === 'history') load();
});

$$('.auth-tab').forEach(button => button.addEventListener('click', () => setTab(button.dataset.atab)));
$('#authClose').addEventListener('click', closeAuth);
modal.addEventListener('click', event => {
  if (event.target === modal) closeAuth();
});
document.addEventListener('click', event => {
  if (!acctMenu.hidden && !event.target.closest('.acct-wrap')) acctMenu.hidden = true;
});
addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modal.hidden) closeAuth();
});

export async function bootAuth() {
  try {
    const data = await authApi.me();
    state.user = data.user;
  } catch (error) {
    if (error.code === 'token_expired') {
      try {
        state.user = (await authApi.refresh()).user;
      } catch {
        state.user = null;
      }
    }
  }
  renderAccount();
  if (state.user) await mergeFromServer();
}

renderAccount();
