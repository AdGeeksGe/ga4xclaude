import { ToolErrorResponse } from '../types.js';

interface GoogleApiError {
  code?: number;
  message?: string;
  details?: unknown[];
}

export function classifyGoogleError(error: unknown, toolName: string): ToolErrorResponse {
  const err = error as { code?: number; message?: string; details?: unknown[] };
  const code = err?.code;
  const message = err?.message || 'Unknown error';

  if (code === 403 || message.includes('PERMISSION_DENIED')) {
    return {
      success: false,
      tool: toolName,
      error: 'PERMISSION_DENIED',
      message: `Service account does not have access. ${message}`,
      suggestion:
        'Go to GA4 Admin → Property Access Management → Add the service account email with at least Viewer role.',
    };
  }

  if (code === 400 || message.includes('INVALID_ARGUMENT')) {
    return {
      success: false,
      tool: toolName,
      error: 'INVALID_ARGUMENT',
      message: `Invalid request: ${message}`,
      suggestion:
        'Check dimension/metric names are valid. Run ga4_get_metadata first to see available dimensions and metrics.',
    };
  }

  if (code === 429 || message.includes('RESOURCE_EXHAUSTED')) {
    return {
      success: false,
      tool: toolName,
      error: 'RESOURCE_EXHAUSTED',
      message: 'GA4 API quota exceeded.',
      suggestion:
        'The Data API allows ~60 core requests per property per hour for free tier. Wait and retry.',
    };
  }

  if (code === 404 || message.includes('NOT_FOUND')) {
    return {
      success: false,
      tool: toolName,
      error: 'NOT_FOUND',
      message: `Resource not found: ${message}`,
      suggestion: 'Run ga4_list_properties to see accessible properties.',
    };
  }

  return {
    success: false,
    tool: toolName,
    error: 'INTERNAL_ERROR',
    message: message,
    suggestion: 'Check server logs for details.',
  };
}
