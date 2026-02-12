import client from './client';

export const onboardingAPI = {
  /**
   * Fetch the authenticated user's onboarding / setup status.
   *
   * Returns:
   *   has_metric_configs  — at least one metric config exists
   *   metric_configs_count
   *   has_api_key         — a user-level API key exists
   *   onboarding_completed_at — timestamp or null
   *   is_setup_complete   — all three conditions are met
   */
  getStatus: async () => {
    const response = await client.get('/auth/onboarding-status');
    return response.data;
  },

  /**
   * Mark the user's onboarding as complete (idempotent).
   * Called after the Code Generation step.
   */
  markComplete: async () => {
    const response = await client.post('/auth/onboarding-complete');
    return response.data;
  },
};
