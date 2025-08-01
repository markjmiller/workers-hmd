import { useState, useEffect } from "react";
import { getConnectionIdentifier } from "../utils";

export interface WorkerConnectionInfo {
  name: string;
  accountId: string;
  apiToken: string;
  hashedApiToken: string;
}

export interface UseWorkerConnectionResult {
  workerInfo: WorkerConnectionInfo | null;
  isConnected: boolean;
  connectionId: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Custom hook for managing worker connection state and validation
 * Provides centralized connection validation, worker info extraction, and connection change detection
 */
export const useWorkerConnection = (): UseWorkerConnectionResult => {
  const [workerInfo, setWorkerInfo] = useState<WorkerConnectionInfo | null>(
    null,
  );
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkConnection = () => {
      try {
        const connectionIdentifier = getConnectionIdentifier();
        const savedConnection = sessionStorage.getItem("workerConnection");

        if (!connectionIdentifier || !savedConnection) {
          // No valid connection - only update state if currently connected
          if (isConnected) {
            setWorkerInfo(null);
            setIsConnected(false);
            setConnectionId(null);
            setError(null);
          }
          setLoading(false);
          return;
        }

        // Parse and validate connection data
        const connection = JSON.parse(savedConnection);
        const rawApiToken = sessionStorage.getItem("apiToken");

        if (
          !connection.accountId ||
          !connection.workerName ||
          !connection.hashedApiToken ||
          !rawApiToken
        ) {
          if (isConnected) {
            setError("Invalid connection data");
            setWorkerInfo(null);
            setIsConnected(false);
            setConnectionId(null);
          }
          setLoading(false);
          return;
        }

        // Only update state if connection has actually changed
        if (connectionIdentifier !== connectionId) {
          setWorkerInfo({
            name: connection.workerName,
            accountId: connection.accountId,
            apiToken: rawApiToken,
            hashedApiToken: connection.hashedApiToken,
          });
          setIsConnected(true);
          setConnectionId(connectionIdentifier);
          setError(null);
        }
        setLoading(false);
      } catch (err) {
        console.error("Error parsing worker connection:", err);
        if (!error) {
          setError("Failed to parse connection data");
        }
        if (isConnected) {
          setWorkerInfo(null);
          setIsConnected(false);
          setConnectionId(null);
        }
        setLoading(false);
      }
    };

    // Check connection initially
    checkConnection();

    // Set up polling to detect connection changes
    const intervalId = setInterval(checkConnection, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return {
    workerInfo,
    isConnected,
    connectionId,
    loading,
    error,
  };
};
