export const NET_ERROR = 'Нет соединения с сервером. Если сайт долго не открывали, он просыпается — подождите минуту и нажмите «Попробовать снова».';

export async function api(path, tries = 2) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  try {
    const response = await fetch(path, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Сервер не ответил');
    return data;
  } catch (error) {
    if (error.name === 'TypeError' && tries > 1) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      return api(path, tries - 1);
    }
    throw new Error(error.name === 'AbortError' || error.name === 'TypeError' ? NET_ERROR : error.message);
  } finally {
    clearTimeout(timer);
  }
}

export async function apiSend(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.detail || 'Сервер не ответил');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TypeError') throw new Error(NET_ERROR);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
