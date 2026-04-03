import client from './client';

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

export const dashboardWidgetsAPI = {
  getAll: async (siteId) => {
    const params = {};
    if (siteId === null) params.site_id = 'null';
    else if (siteId !== undefined && siteId !== '') params.site_id = siteId;
    const response = await client.get('/dashboard-widgets', { params });
    const data = unwrap(response.data);
    return Array.isArray(data) ? data : [];
  },

  getById: async (id) => {
    const response = await client.get(`/dashboard-widgets/${id}`);
    return unwrap(response.data) ?? null;
  },

  create: async (payload) => {
    const response = await client.post('/dashboard-widgets', payload);
    return unwrap(response.data);
  },

  update: async (id, payload) => {
    const response = await client.patch(`/dashboard-widgets/${id}`, payload);
    return unwrap(response.data);
  },

  delete: async (id) => {
    const response = await client.delete(`/dashboard-widgets/${id}`);
    return response.data;
  },
};
