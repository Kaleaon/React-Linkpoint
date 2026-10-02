import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  errorRecovery,
  ErrorRecoveryService,
  ErrorRecoverySnapshot,
  ActiveErrorState,
  TelemetryEntry,
} from '../linkpoint/errorRecovery';

interface ErrorRecoveryContextValue extends ErrorRecoverySnapshot {
  service: ErrorRecoveryService;
  enqueueRetry: <T>(options: {
    action: () => Promise<T>;
    category?: string;
    code?: string;
    description?: string;
    maxRetries?: number;
    onSuccess?: (result: T) => void;
    onFailure?: (error: Error) => void;
  }) => Promise<T>;
  logTelemetry: (category: string, code: string, message: string, details?: Record<string, any>) => TelemetryEntry;
  clearError: () => void;
  processRetryQueue: () => Promise<void>;
  setOnlineStatus: (online: boolean) => void;
}

const ErrorRecoveryContext = createContext<ErrorRecoveryContextValue | null>(null);

export const ErrorRecoveryProvider: React.FC<{ children: React.ReactNode; customService?: ErrorRecoveryService }> = ({
  children,
  customService,
}) => {
  const service = customService || errorRecovery;
  const [snapshot, setSnapshot] = useState<ErrorRecoverySnapshot>(() => service.getSnapshot());

  useEffect(() => {
    const unsubscribe = service.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });
    return unsubscribe;
  }, [service]);

  const enqueueRetry = useCallback(
    <T,>(options: Parameters<ErrorRecoveryContextValue['enqueueRetry']>[0]) => {
      return service.enqueueRetry<T>(options as any);
    },
    [service]
  );

  const logTelemetry = useCallback(
    (category: string, code: string, message: string, details?: Record<string, any>) => {
      return service.logTelemetry(category, code, message, details);
    },
    [service]
  );

  const clearError = useCallback(() => {
    service.clearActiveError();
  }, [service]);

  const processRetryQueue = useCallback(() => {
    return service.processRetryQueue();
  }, [service]);

  const setOnlineStatus = useCallback(
    (online: boolean) => {
      service.setOnlineStatus(online);
    },
    [service]
  );

  return (
    <ErrorRecoveryContext.Provider
      value={{
        ...snapshot,
        service,
        enqueueRetry,
        logTelemetry,
        clearError,
        processRetryQueue,
        setOnlineStatus,
      }}
    >
      {children}
    </ErrorRecoveryContext.Provider>
  );
};

export function useErrorRecovery(): ErrorRecoveryContextValue {
  const ctx = useContext(ErrorRecoveryContext);
  if (!ctx) {
    throw new Error('useErrorRecovery must be used within an ErrorRecoveryProvider');
  }
  return ctx;
}
