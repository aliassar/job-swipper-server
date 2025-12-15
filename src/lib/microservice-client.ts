import { ExternalServiceError } from './errors';

interface MicroserviceClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class MicroserviceClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(options: MicroserviceClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
  }

  async request<T = unknown>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      requestId?: string;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {}, requestId } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(requestId && { 'X-Request-ID': requestId }),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ExternalServiceError(
          this.baseUrl,
          `Request failed with status ${response.status}: ${errorText}`
        );
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        this.baseUrl,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

// Pre-configured clients for each microservice
export const scraperClient = new MicroserviceClient({
  baseUrl: process.env.SCRAPER_SERVICE_URL || '',
  apiKey: process.env.SCRAPER_SERVICE_KEY || '',
});

export const resumeAIClient = new MicroserviceClient({
  baseUrl: process.env.RESUME_AI_SERVICE_URL || '',
  apiKey: process.env.RESUME_AI_SERVICE_KEY || '',
});

export const coverLetterAIClient = new MicroserviceClient({
  baseUrl: process.env.COVER_LETTER_AI_SERVICE_URL || '',
  apiKey: process.env.COVER_LETTER_AI_SERVICE_KEY || '',
});

export const emailSyncClient = new MicroserviceClient({
  baseUrl: process.env.EMAIL_SYNC_SERVICE_URL || '',
  apiKey: process.env.EMAIL_SYNC_SERVICE_KEY || '',
});

export const aiFilteringClient = new MicroserviceClient({
  baseUrl: process.env.AI_FILTERING_SERVICE_URL || '',
  apiKey: process.env.AI_FILTERING_SERVICE_KEY || '',
});

export const jobFilterClient = new MicroserviceClient({
  baseUrl: process.env.JOB_FILTER_SERVICE_URL || '',
  apiKey: process.env.JOB_FILTER_SERVICE_KEY || '',
});

export const applicationSenderClient = new MicroserviceClient({
  baseUrl: process.env.APPLICATION_SENDER_SERVICE_URL || '',
  apiKey: process.env.APPLICATION_SENDER_SERVICE_KEY || '',
});

export const stageUpdaterClient = new MicroserviceClient({
  baseUrl: process.env.STAGE_UPDATER_SERVICE_URL || '',
  apiKey: process.env.STAGE_UPDATER_SERVICE_KEY || '',
});
