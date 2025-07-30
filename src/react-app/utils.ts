// Shared utility functions for React app

/**
 * Format time in seconds as H:M:S
 */
export const formatTimeHMS = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format release state for display
 */
export const formatReleaseState = (state: string): string => {
  switch (state) {
    case 'not_started':
      return 'NOT STARTED';
    case 'running':
      return 'RUNNING';
    case 'done_successful':
      return 'SUCCESS';
    case 'done_failed':
      return 'FAILED';
    case 'done_stopped_manually':
      return 'STOPPED MANUALLY';
    case 'done_failed_slo':
      return 'FAILED (SLO)';
    default:
      return state.replace(/_/g, ' ').toUpperCase();
  }
};

/**
 * Format stage state for display
 */
export const formatStageState = (state: string): string => {
  switch (state) {
    case 'queued':
      return 'QUEUED';
    case 'awaiting_approval':
      return 'AWAITING APPROVAL';
    case 'running':
      return 'RUNNING';
    case 'done_failed':
      return 'FAILED';
    case 'done_successful':
      return 'SUCCESS';
    case 'done_cancelled':
      return 'CANCELLED';
    default:
      return state.replace(/_/g, ' ').toUpperCase();
  }
};

/**
 * Generic API fetch utility with error handling
 */
export const apiRequest = async <T = any>(
  url: string, 
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  
  return response.text() as T;
};

/**
 * Specialized API utilities for common endpoints
 */
export const api = {
  // Release endpoints
  getActiveRelease: () => apiRequest('/api/release/active'),
  createRelease: (data?: { old_version: string; new_version: string }) => 
    apiRequest('/api/release', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    }),
  startRelease: () => {
    const workerConnectionData = sessionStorage.getItem('workerConnection');
    const connection = workerConnectionData ? JSON.parse(workerConnectionData) : {};
    
    return apiRequest('/api/release/active', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'start',
        account_id: connection.accountId || '',
        api_token: connection.apiToken || ''
      })
    });
  },
  stopRelease: () => {
    const workerConnectionData = sessionStorage.getItem('workerConnection');
    const connection = workerConnectionData ? JSON.parse(workerConnectionData) : {};
    
    return apiRequest('/api/release/active', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'stop',
        account_id: connection.accountId || '',
        api_token: ''
      })
    });
  },
  deleteActiveRelease: () => apiRequest('/api/release/active', { method: 'DELETE' }),
  getReleaseHistory: (params: URLSearchParams) => apiRequest(`/api/release?${params}`),

  // Stage endpoints
  getStage: (stageId: string) => apiRequest(`/api/stage/${stageId}`),
  progressStage: (stageId: string, command: 'approve' | 'deny') => 
    apiRequest(`/api/stage/${stageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: command
    }),

  // Plan endpoints
  getPlan: () => apiRequest('/api/plan'),
  updatePlan: (plan: any) => apiRequest('/api/plan', {
    method: 'POST',
    body: JSON.stringify(plan)
  }),
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
    case 'done_successful':
      return '#4caf50';
    case 'done_stopped_manually':
      return '#ff9800';
    case 'done_failed_slo':
      return '#f44336';
    default:
      return '#757575';
  }
};

/**
 * Check if a stage state is considered "done" (completed)
 */
export const isStageComplete = (state: string): boolean => {
  return state === "done_successful" || state === "done_failed";
};
