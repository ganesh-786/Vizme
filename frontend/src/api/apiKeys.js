import client from './client';

export const apiKeysAPI = {
  getAll: async () => {
    const response = await client.get('/api-keys');
    return response.data;
  },

  create: async (keyName) => {
    const response = await client.post('/api-keys', {
      key_name: keyName,
    });
    return response.data;
  },

  update: async (id, data) => {
    const response = await client.patch(`/api-keys/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await client.delete(`/api-keys/${id}`);
    return response.data;
  },
};
