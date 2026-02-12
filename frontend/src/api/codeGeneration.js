import client from './client';

export const codeGenerationAPI = {
  /**
   * Generate the tracking code snippet.
   *
   * `apiKeyId` is optional — when omitted the backend auto-resolves the
   * user's primary API key.  The generated snippet covers ALL metric
   * configurations for the user.
   */
  generate: async (apiKeyId = null, options = {}) => {
    const body = {
      auto_track: options.autoTrack !== false,
      custom_events: options.customEvents !== false,
    };

    if (apiKeyId != null) {
      body.api_key_id = apiKeyId;
    }

    const response = await client.post('/code-generation', body);
    return response.data;
  },
};
