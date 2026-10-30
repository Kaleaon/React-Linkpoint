/**
 * Centralized Error Mapping Catalog
 * Converts technical error codes into human-readable titles, plain-language descriptions,
 * and recommended recovery actions for recovery UI components.
 */

export interface ErrorTranslation {
  title: string;
  description: string;
  actionHint: string;
}

export const ERROR_CATALOG: Record<string, ErrorTranslation> = {
  BACKEND_OUTAGE: {
    title: 'Connection Interrupted',
    description: 'Unable to reach Second Life servers.',
    actionHint: 'Please retry your request or check server status.',
  },
  NET_DISCONNECTED: {
    title: 'Network Disconnected',
    description: 'Your device is currently offline.',
    actionHint: 'Check your internet connection and try again.',
  },
  HTTP_500: {
    title: 'Server Error',
    description: 'The server encountered an internal error processing your request.',
    actionHint: 'Retry the operation or return to safe navigation.',
  },
  CAPS_EXHAUSTED: {
    title: 'Capability Capped',
    description: 'Service capability limits have been temporarily exceeded.',
    actionHint: 'Wait briefly while service limits reset, then retry.',
  },
  AUTH_EXPIRED: {
    title: 'Session Expired',
    description: 'Your authentication session has expired.',
    actionHint: 'Please return to login to refresh your session.',
  },
};

/**
 * Returns human-readable error title, description, and action hint for a technical error code.
 */
export function getErrorTranslation(code: string, fallbackMessage?: string): ErrorTranslation {
  if (code && ERROR_CATALOG[code]) {
    return ERROR_CATALOG[code];
  }

  return {
    title: 'Service Recovery Gateway',
    description: fallbackMessage || 'An unexpected service error occurred.',
    actionHint: 'Retry the operation or return to safe navigation.',
  };
}
