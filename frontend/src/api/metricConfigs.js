import client from './client';

// Backend returns { success, data }. Normalize so callers get the inner data.
const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

export const metricConfigsAPI = {
  getAll: async () => {
    const response = await client.get('/metric-configs');
    const data = unwrap(response.data);
    return Array.isArray(data) ? data : [];
  },

  getById: async (id) => {
    const response = await client.get(`/metric-configs/${id}`);
    return unwrap(response.data) ?? null;
  },

  create: async (data) => {
    const response = await client.post('/metric-configs', data);
    return unwrap(response.data);
  },

  update: async (id, data) => {
    const response = await client.patch(`/metric-configs/${id}`, data);
    return unwrap(response.data);
  },

  delete: async (id) => {
    const response = await client.delete(`/metric-configs/${id}`);
    return response.data;
  },
};
