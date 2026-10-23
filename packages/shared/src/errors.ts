/**
 * Application error codes. UI maps these to toasts / upgrade CTAs (ARCHITECTURE §9.1).
 */
export const APP_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'INSUFFICIENT_CREDITS',
  'CLIENT_ALLOTMENT_EXHAUSTED',
  'PLAN_REQUIRED',
  'LIMIT_REACHED',
  'PART_LOCKED',
  'JOB_ALREADY_RUNNING',
  'QUEUE_UNAVAILABLE',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
