export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[ch]));
