import client from './client';

const unwrap = (res) => (res && res.data !== undefined ? res.data : res);

export const sitesAPI = {
  getAll: async () => {
    const response = await client.get('/sites');
    const data = unwrap(response.data);
    return Array.isArray(data) ? data : [];
  },

  create: async (name) => {
    const response = await client.post('/sites', { name });
    return unwrap(response.data);
  },

  update: async (id, name) => {
    const response = await client.patch(`/sites/${id}`, { name });
    return unwrap(response.data);
  },

  delete: async (id) => {
    const response = await client.delete(`/sites/${id}`);
    return response.data;
  },
};
