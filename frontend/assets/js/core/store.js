export const KEYS = {
  saved: 'aoi-saved-v2',
  cont: 'aoi-cont-v1',
  recent: 'aoi-recent-v1',
  quality: 'aoi-quality-v1',
  voice: key => `aoi-voice-${key}`
};

export function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
