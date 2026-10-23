import { apiSend, apiUpload } from './api.js';

export const authApi = {
  me: () => apiSend('/api/auth/me'),
  refresh: () => apiSend('/api/auth/refresh', { method: 'POST' }),
  register: payload => apiSend('/api/auth/register', { method: 'POST', body: payload }),
  login: payload => apiSend('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => apiSend('/api/auth/logout', { method: 'POST' }),
  changePassword: payload => apiSend('/api/auth/password', { method: 'POST', body: payload }),
  deleteAccount: payload => apiSend('/api/auth/account', { method: 'DELETE', body: payload }),
  data: () => apiSend('/api/user/data'),
  sync: payload => apiSend('/api/user/sync', { method: 'POST', body: payload }),
  putSaved: (key, item) => apiSend(`/api/user/saved/${encodeURIComponent(key)}`, { method: 'PUT', body: { item } }),
  delSaved: key => apiSend(`/api/user/saved/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  putCont: (key, entry) => apiSend(`/api/user/cont/${encodeURIComponent(key)}`, { method: 'PUT', body: { entry } }),
  delCont: key => apiSend(`/api/user/cont/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  addWatchTime: seconds => apiSend('/api/user/stats/time', { method: 'POST', body: { seconds } }),
  markEpisode: (itemKey, season, ep) => apiSend('/api/user/stats/episode', { method: 'POST', body: { itemKey, season, ep } })
};

export const profileApi = {
  me: () => apiSend('/api/profile'),
  update: payload => apiSend('/api/profile', { method: 'PUT', body: payload }),
  uploadAvatar: formData => apiUpload('/api/profile/avatar', formData),
  removeAvatar: () => apiSend('/api/profile/avatar', { method: 'DELETE' }),
  byUsername: username => apiSend(`/api/profile/u/${encodeURIComponent(username)}`)
};
