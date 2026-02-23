import { refreshTokenRepository } from '@/repositories/refreshToken.repository.js';
import { logger } from '@/utils/logger.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startTokenCleanupJob(): NodeJS.Timeout {
  logger.info('Starting token cleanup job');

  const cleanup = async () => {
    try {
      await refreshTokenRepository.deleteExpired();
      logger.debug('Expired tokens cleaned up');
    } catch (error) {
      logger.error({ error }, 'Token cleanup failed');
    }
  };

  // Run immediately on startup
  cleanup();

  // Then run periodically
  return setInterval(cleanup, CLEANUP_INTERVAL_MS);
}
