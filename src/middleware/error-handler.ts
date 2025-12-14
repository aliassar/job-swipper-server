import { Context } from 'hono';
import { AppError } from '../lib/errors';
import { formatResponse } from '../lib/utils';

export async function errorHandler(err: Error, c: Context) {
  console.error('Error:', err);

  const requestId = c.get('requestId') || 'unknown';

    type HonoStatus = 400 | 401 | 403 | 404 | 429 | 500 | 502;

    const isHonoStatus = (code: number): code is HonoStatus =>
        [400, 401, 403, 404, 429, 500, 502].includes(code);

    if (err instanceof AppError) {
        const status: HonoStatus = isHonoStatus(err.statusCode)
            ? err.statusCode
            : 500;

        return c.json(
            formatResponse(
                false,
                null,
                {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                },
                requestId
            ),
            status
        );
    }


  // Unknown error
  return c.json(
    formatResponse(false, null, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    }, requestId),
    500
  );
}
