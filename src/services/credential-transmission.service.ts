import { stageUpdaterClient } from '../lib/microservice-client';
import { 
  StageUpdaterCredentialsRequest, 
  StageUpdaterCredentialsResponse,
  EmailProvider 
} from '../lib/microservices';
import { logger } from '../middleware/logger';
import { ExternalServiceError } from '../lib/errors';

interface TransmissionOptions {
  maxRetries?: number;
  retryDelay?: number;
  requestId?: string;
}

/**
 * Service for transmitting email credentials to Stage Updater microservice
 * Implements retry logic for transient failures
 */
export const credentialTransmissionService = {
  /**
   * Send email credentials to Stage Updater microservice
   * 
   * @param userId - User ID
   * @param provider - Email provider type
   * @param credentials - Email credentials (decrypted)
   * @param options - Transmission options (retries, delays, etc.)
   */
  async sendCredentials(
    userId: string,
    provider: EmailProvider,
    credentials: {
      email: string;
      accessToken?: string;
      refreshToken?: string;
      imapServer?: string;
      imapPort?: number;
      imapUsername?: string;
      imapPassword?: string;
    },
    options: TransmissionOptions = {}
  ): Promise<StageUpdaterCredentialsResponse> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      requestId,
    } = options;

    const payload: StageUpdaterCredentialsRequest = {
      userId,
      provider,
      credentials,
    };

    logger.info(
      { userId, provider, requestId },
      'Sending credentials to Stage Updater microservice'
    );

    let lastError: Error | null = null;
    
    // Retry logic with exponential backoff
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await stageUpdaterClient.request<StageUpdaterCredentialsResponse>(
          '/email-credentials',
          {
            method: 'POST',
            body: payload,
            requestId,
          }
        );

        if (response.success) {
          logger.info(
            { userId, provider, attempt, requestId },
            'Successfully sent credentials to Stage Updater'
          );
          return response;
        } else {
          // Service returned success: false
          logger.error(
            { userId, provider, error: response.error, requestId },
            'Stage Updater rejected credentials'
          );
          throw new ExternalServiceError(
            'Stage Updater',
            response.error || 'Credentials rejected'
          );
        }
      } catch (error) {
        lastError = error as Error;
        
        const isLastAttempt = attempt === maxRetries;
        
        logger.warn(
          {
            userId,
            provider,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            error: lastError.message,
            requestId,
          },
          isLastAttempt
            ? 'Failed to send credentials - no more retries'
            : 'Failed to send credentials - will retry'
        );

        if (!isLastAttempt) {
          // Exponential backoff: wait longer on each retry
          const delay = retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    logger.error(
      { userId, provider, maxRetries, error: lastError?.message, requestId },
      'Failed to send credentials after all retries'
    );

    throw new ExternalServiceError(
      'Stage Updater',
      `Failed to send credentials after ${maxRetries + 1} attempts: ${lastError?.message}`
    );
  },

  /**
   * Test connection to Stage Updater microservice
   * Performs an actual HTTP request to validate service availability
   * Returns true if the service is reachable and responding
   */
  async testConnection(): Promise<boolean> {
    try {
      // Check if service URL is configured
      const serviceUrl = process.env.STAGE_UPDATER_SERVICE_URL;
      if (!serviceUrl) {
        logger.warn('STAGE_UPDATER_SERVICE_URL is not configured');
        return false;
      }

      // Attempt a simple health check request
      // Using a short timeout to avoid blocking
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      try {
        const response = await fetch(`${serviceUrl}/health`, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          logger.info('Stage Updater connection test successful');
          return true;
        } else {
          logger.warn(
            { status: response.status },
            'Stage Updater health check returned non-OK status'
          );
          return false;
        }
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Stage Updater connection test failed'
      );
      return false;
    }
  },

  /**
   * Helper function to sleep for a given duration
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
