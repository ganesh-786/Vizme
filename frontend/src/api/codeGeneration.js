import client from './client';

export const codeGenerationAPI = {
  generate: async (apiKeyId, metricConfigId, options = {}) => {
    const response = await client.post('/code-generation', {
      api_key_id: apiKeyId,
      metric_config_id: metricConfigId,
      auto_track: options.autoTrack !== false,
      custom_events: options.customEvents !== false
    });
    return response.data;
  }
};
