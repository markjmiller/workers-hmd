// Shared utility functions for React app

/**
 * Hash API token for secure change detection (frontend version)
 * Uses the same algorithm as the backend for consistency
 */
export const hashApiToken = async (apiToken: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 8);
};

/**
 * Display short version of UUID for better readability
 * Extracts first section before the first dash
 */
export const getShortVersionId = (fullVersionId: string): string => {
  return fullVersionId.split("-")[0];
};

/**
 * Format time in seconds as H:M:S
 */
export const formatTimeHMS = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Format release state for display
 */
export const formatReleaseState = (state: string): string => {
  switch (state) {
    case "not_started":
      return "NOT STARTED";
    case "running":
      return "RUNNING";
    case "done_successful":
      return "SUCCESS";
    case "done_stopped_manually":
      return "STOPPED MANUALLY";
    case "done_failed_slo":
      return "FAILED";
    default:
      return state.replace(/_/g, " ").toUpperCase();
  }
};

/**
 * Format stage state for display
 */
export const formatStageState = (state: string): string => {
  switch (state) {
    case "queued":
      return "QUEUED";
    case "awaiting_approval":
      return "AWAITING APPROVAL";
    case "running":
      return "RUNNING";
    case "done_failed":
      return "FAILED";
    case "done_successful":
      return "SUCCESS";
    case "done_cancelled":
      return "CANCELLED";
    default:
      return state.replace(/_/g, " ").toUpperCase();
  }
};

/**
 * Get CloudflareConnection details from session storage
 * Returns null if no connection exists (for graceful handling during app initialization)
 * Note: Raw API token is retrieved separately from sessionStorage for security
 */
const getCloudflareConnection = (): { accountId: string; workerName: string; apiToken: string } | null => {
  const workerConnectionData = sessionStorage.getItem("workerConnection");
  const rawApiToken = sessionStorage.getItem("apiToken");
  
  if (!workerConnectionData || !rawApiToken) {
    return null;
  }
  
  try {
    const connection = JSON.parse(workerConnectionData);
    if (!connection.accountId || !connection.workerName || !connection.hashedApiToken) {
      return null;
    }
    return {
      accountId: connection.accountId,
      workerName: connection.workerName,
      apiToken: rawApiToken // Retrieve raw token only when needed
    };
  } catch (error) {
    return null;
  }
};

/**
 * Get connection identifier for secure change detection
 * Uses hashed token instead of raw token for security
 */
export const getConnectionIdentifier = (): string | null => {
  const workerConnectionData = sessionStorage.getItem("workerConnection");
  if (!workerConnectionData) {
    return null;
  }
  
  try {
    const connection = JSON.parse(workerConnectionData);
    if (!connection.accountId || !connection.workerName || !connection.hashedApiToken) {
      return null;
    }
    // Return a unique identifier based on hashed data for change detection
    return `${connection.accountId}-${connection.workerName}-${connection.hashedApiToken}`;
  } catch (error) {
    return null;
  }
};

/**
 * Generic API fetch utility with error handling
 */
export const apiRequest = async <T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  return response.text() as T;
};

/**
 * Specialized API utilities for common endpoints
 */
export const api = {
  // Release endpoints
  getActiveRelease: () => {
    const connection = getCloudflareConnection();
    if (!connection) {
      // Return null when no connection exists (graceful handling during app initialization)
      return Promise.resolve(null);
    }
    return apiRequest("/api/release/active/get", {
      method: "POST",
      body: JSON.stringify(connection)
    });
  },
  createRelease: (data?: { old_version: string; new_version: string }) => {
    const connection = getCloudflareConnection();
    if (!connection) {
      return Promise.reject(new Error("No worker connection found. Please connect to a worker first."));
    }
    return apiRequest("/api/release/create", {
      method: "POST",
      body: JSON.stringify({ ...connection, ...data })
    });
  },
  startRelease: () => {
    const connection = getCloudflareConnection();
    if (!connection) {
      return Promise.reject(new Error("No worker connection found. Please connect to a worker first."));
    }
    return apiRequest("/api/release/active", {
      method: "POST",
      body: JSON.stringify({ ...connection, command: "start" })
    });
  },
  stopRelease: () => {
    const connection = getCloudflareConnection();
    if (!connection) {
      return Promise.reject(new Error("No worker connection found. Please connect to a worker first."));
    }
    return apiRequest("/api/release/active", {
      method: "POST",
      body: JSON.stringify({ ...connection, command: "stop" })
    });
  },
  deleteActiveRelease: () => {
    const connection = getCloudflareConnection();
    if (!connection) {
      return Promise.reject(new Error("No worker connection found. Please connect to a worker first."));
    }
    return apiRequest("/api/release/active", {
      method: "DELETE",
      body: JSON.stringify(connection)
    });
  },
  getReleaseHistory: (params: { limit?: number; offset?: number; since?: string; until?: string; state?: string } = {}) => {
    const connection = getCloudflareConnection();
    if (!connection) {
      return Promise.reject(new Error("No worker connection found. Please connect to a worker first."));
    }
    return apiRequest("/api/release", {
      method: "POST",
      body: JSON.stringify({ connection, ...params })
    });
  },

  // Stage endpoints
  getStage: (stageId: string) => apiRequest(`/api/stage/${stageId}`),
  progressStage: (stageId: string, command: "approve" | "deny") =>
    apiRequest(`/api/stage/${stageId}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: command,
    }),

  // Plan endpoints
  getPlan: () => {
    const connection = getCloudflareConnection();
    if (!connection) {
      return Promise.reject(new Error("No worker connection found. Please connect to a worker first."));
    }
    return apiRequest("/api/plan", {
      method: "POST",
      body: JSON.stringify(connection)
    });
  },
  updatePlan: (plan: any) => {
    const connection = getCloudflareConnection();
    if (!connection) {
      return Promise.reject(new Error("No worker connection found. Please connect to a worker first."));
    }
    return apiRequest("/api/plan", {
      method: "PUT",
      body: JSON.stringify({ connection, plan })
    });
  }
};

/**
 * Check if a release state is considered "done" (completed)
 */
export const isReleaseComplete = (state: string): boolean => {
  return state !== "not_started" && state !== "running";
};

/**
 * Check if a release state is active (running or not started)
 */
export const isReleaseActive = (state: string): boolean => {
  return state === "not_started" || state === "running";
};

/**
 * Get color for release state display
 */
export const getStateColor = (state: string): string => {
  switch (state) {
    case "done_successful":
      return "#4caf50";
    case "done_stopped_manually":
      return "#ff9800";
    case "done_failed_slo":
      return "#f44336";
    default:
      return "#757575";
  }
};

/**
 * Check if a stage state is considered "done" (completed)
 */
export const isStageComplete = (state: string): boolean => {
  return state === "done_successful" || state === "done_failed";
};
