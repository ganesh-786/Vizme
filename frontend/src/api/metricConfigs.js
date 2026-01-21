import client from './client';

export const metricConfigsAPI = {
  getAll: async () => {
    const response = await client.get('/metric-configs');
    return response.data;
  },

  getById: async (id) => {
    const response = await client.get(`/metric-configs/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await client.post('/metric-configs', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await client.patch(`/metric-configs/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await client.delete(`/metric-configs/${id}`);
    return response.data;
  }
};
