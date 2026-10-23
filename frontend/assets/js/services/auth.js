import { apiSend } from './api.js';

export const authApi = {
  me: () => apiSend('/api/auth/me'),
  refresh: () => apiSend('/api/auth/refresh', { method: 'POST' }),
  register: payload => apiSend('/api/auth/register', { method: 'POST', body: payload }),
  login: payload => apiSend('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => apiSend('/api/auth/logout', { method: 'POST' }),
  data: () => apiSend('/api/user/data'),
  sync: payload => apiSend('/api/user/sync', { method: 'POST', body: payload }),
  putSaved: (key, item) => apiSend(`/api/user/saved/${encodeURIComponent(key)}`, { method: 'PUT', body: { item } }),
  delSaved: key => apiSend(`/api/user/saved/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  putCont: (key, entry) => apiSend(`/api/user/cont/${encodeURIComponent(key)}`, { method: 'PUT', body: { entry } }),
  delCont: key => apiSend(`/api/user/cont/${encodeURIComponent(key)}`, { method: 'DELETE' })
};
