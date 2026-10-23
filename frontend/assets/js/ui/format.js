export const STATUS = {
  ongoing: 'Выходит',
  released: 'Завершено',
  anons: 'Скоро'
};

export const RU_GENRES = {
  'Action': 'Экшен',
  'Adventure': 'Приключения',
  'Comedy': 'Комедия',
  'Drama': 'Драма',
  'Fantasy': 'Фэнтези',
  'Horror': 'Ужасы',
  'Mahou Shoujo': 'Махо-сёдзё',
  'Mecha': 'Меха',
  'Music': 'Музыка',
  'Mystery': 'Детектив',
  'Psychological': 'Психология',
  'Romance': 'Романтика',
  'Sci-Fi': 'Фантастика',
  'Slice of Life': 'Повседневность',
  'Sports': 'Спорт',
  'Supernatural': 'Сверхъестественное',
  'Thriller': 'Триллер',
  'Ecchi': 'Этти'
};

export function merge(target, source) {
  for (const key in source) {
    const value = source[key];
    if (value != null && value !== '' && !(Array.isArray(value) && !value.length)) target[key] = value;
  }
  return target;
}

export const rate = value => (value ? Number(value).toFixed(1) : '—');

export const statusOf = item => STATUS[item.status] || (item.kind === 'anime' ? 'Фильм' : 'Аниме');

export function formatTime(seconds) {
  const total = Math.floor(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

export function slim(item) {
  const { desc, _info, ru, ...rest } = item;
  return rest;
}
