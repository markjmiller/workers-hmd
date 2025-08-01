import { useState, useCallback } from "react";
import { useWorkerConnection } from "./useWorkerConnection";

export interface UseApiWithConnectionResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (...args: any[]) => Promise<T | null>;
  reset: () => void;
}

/**
 * Custom hook for making API calls that require worker connection
 * Provides centralized error handling, loading states, and connection validation
 */
export function useApiWithConnection<T>(
  apiFunction: (...args: any[]) => Promise<T>,
  {
    onSuccess,
    onError,
    requireConnection = true,
  }: {
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    requireConnection?: boolean;
  } = {},
): UseApiWithConnectionResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { isConnected, connectionId } = useWorkerConnection();

  const execute = useCallback(
    async (...args: any[]): Promise<T | null> => {
      // Check connection requirement
      if (requireConnection && (!isConnected || !connectionId)) {
        const errorMsg =
          "No worker connection found. Please connect to a worker first.";
        setError(errorMsg);
        setData(null);
        onError?.(errorMsg);
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await apiFunction(...args);
        setData(result);
        setLoading(false);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "API request failed";
        setError(errorMsg);
        setData(null);
        setLoading(false);
        onError?.(errorMsg);
        return null;
      }
    },
    [
      apiFunction,
      isConnected,
      connectionId,
      requireConnection,
      onSuccess,
      onError,
    ],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
}
