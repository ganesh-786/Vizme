import client from './client';

export const codeGenerationAPI = {
  generate: async (apiKeyId, metricConfigId, options = {}) => {
    const body = {
      api_key_id: apiKeyId,
      auto_track: options.autoTrack !== false,
      custom_events: options.customEvents !== false,
    };

    // Only include metric_config_id when it is a real integer — avoids
    // sending `null` which express-validator's optional() can reject.
    if (metricConfigId != null) {
      body.metric_config_id = metricConfigId;
    }

    const response = await client.post('/code-generation', body);
    return response.data;
  },
};
