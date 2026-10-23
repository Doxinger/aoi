import { RU_GENRES } from '../ui/format.js';

const QUERY = 'query($search:String,$sort:[MediaSort],$status:MediaStatus,$genre:String,$ids:[Int]){Page(page:1,perPage:30){media(type:ANIME,isAdult:false,search:$search,sort:$sort,status:$status,genre:$genre,idMal_in:$ids){idMal title{romaji english}coverImage{extraLarge}bannerImage averageScore status episodes seasonYear format genres}}}';

const AL_STATUS = {
  RELEASING: 'ongoing',
  FINISHED: 'released',
  NOT_YET_RELEASED: 'anons'
};

async function post(url, body, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body
    });
    const data = await response.json();
    if (!response.ok || data.errors) throw new Error('bad');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function anilist(vars) {
  const variables = Object.fromEntries(Object.entries(vars).filter(([, value]) => value !== undefined && value !== ''));
  const body = JSON.stringify({ query: QUERY, variables });
  let data;
  try {
    try {
      data = await post('/api/al', body, 30000);
    } catch {
      data = await post('https://graphql.anilist.co', body, 15000);
    }
    const page = data && data.data && data.data.Page;
    const media = page && Array.isArray(page.media) ? page.media : null;
    if (!media) throw new Error('AniList вернул пустой ответ');
    return media.filter(item => item && item.idMal);
  } catch (error) {
    try {
      const params = new URLSearchParams();
      if (vars.ids && vars.ids.length) params.set('ids', vars.ids.join(','));
      if (vars.search) params.set('search', vars.search);
      if (vars.status) params.set('status', vars.status);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);
      let response;
      try {
        response = await fetch('/api/catalog?' + params.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error('Резервный каталог HTTP ' + response.status);
      const payload = await response.json();
      const page = payload && payload.data && payload.data.Page;
      const media = page && Array.isArray(page.media) ? page.media : null;
      if (!media) throw new Error('Неверный ответ резервного каталога');
      return media.filter(item => item && item.idMal);
    } catch (fallbackError) {
      console.error('AOI catalogue failed', error, fallbackError);
      throw new Error('Каталог временно недоступен. Проверьте соединение и сервер, затем попробуйте снова.');
    }
  }
}

export const toCard = media => ({
  key: 's' + media.idMal,
  title: (media.title && (media.title.english || media.title.romaji)) || 'Аниме',
  orig: media.title && media.title.romaji,
  year: media.seasonYear,
  poster: media.coverImage && media.coverImage.extraLarge,
  banner: media.bannerImage,
  desc: '',
  genres: (media.genres || []).map(genre => RU_GENRES[genre] || genre),
  status: AL_STATUS[media.status],
  shiki: media.averageScore ? media.averageScore / 10 : null,
  kp: null,
  imdb: null,
  eps: media.episodes,
  kind: media.format === 'MOVIE' ? 'anime' : 'anime-serial'
});
