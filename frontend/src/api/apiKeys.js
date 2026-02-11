import client from './client';

export const apiKeysAPI = {
  /** Fetch all keys for the authenticated user (keys are masked — no raw values). */
  getAll: async () => {
    const response = await client.get('/api-keys');
    return response.data;
  },

  /** Manually create a new API key. Raw key is in the response for one-time clipboard copy. */
  create: async (keyName) => {
    const response = await client.post('/api-keys', {
      key_name: keyName,
    });
    return response.data;
  },

  /**
   * Idempotent ensure — returns the existing key (masked) or creates a new one.
   * When `is_new` is true the response contains `data.api_key` for one-time copy.
   *
   * @param {number|null} metricConfigId - optional metric config to scope the key to
   */
  ensure: async (metricConfigId = null) => {
    const response = await client.post('/api-keys/ensure', {
      metric_config_id: metricConfigId,
    });
    return response.data;
  },

  /**
   * Retrieve the raw API key for clipboard copy only.
   * The frontend must NEVER render this value — use it only with navigator.clipboard.
   */
  copy: async (id) => {
    const response = await client.post(`/api-keys/${id}/copy`);
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
