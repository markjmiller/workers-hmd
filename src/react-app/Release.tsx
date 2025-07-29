import React, { useState, useEffect, useRef } from 'react';
import type { components } from '../../types/api';
import { StageItem } from './StageItem';
import './Release.css';

type Release = components['schemas']['Release'];
type ReleaseStage = components['schemas']['ReleaseStage'];

interface ReleaseProps {
  onError?: (error: string) => void;
  onReleaseStateChange?: () => void;
  onTabChange?: () => void; // Called when user switches away from Release tab
}

// Helper function to format release state display names
const formatReleaseState = (state: string): string => {
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
    default:
      return state.replace('_', ' ').toUpperCase();
  }
};

export const Release: React.FC<ReleaseProps> = ({ onError, onReleaseStateChange, onTabChange }) => {
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const [releaseStages, setReleaseStages] = useState<ReleaseStage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingStages, setLoadingStages] = useState(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number | undefined>();

  // Check for active release on component mount
  useEffect(() => {
    checkActiveRelease();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStagePolling();
      stopElapsedTimeTimer();
    };
  }, []);

  // Create release handler
  const handleCreateRelease = async () => {
    await createRelease();
    // Force refresh to check for new active release
    await checkActiveRelease();
  };

  // Start polling for stage updates
  const startStagePolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const interval = setInterval(async () => {
      if (!activeRelease || !activeRelease.stages) {
        return;
      }

      try {
        // First, poll the active release to get updated release state
        const releaseResponse = await fetch('/api/release/active');
        if (releaseResponse.ok) {
          const updatedRelease = await releaseResponse.json();
          setActiveRelease(updatedRelease);
          
          // Start/stop elapsed time timer based on release state
          if (updatedRelease.state === 'running') {
            startElapsedTimeTimer(updatedRelease);
          } else {
            stopElapsedTimeTimer();
          }
          
          // If release state changed to a done state, redirect to history tab
          if (updatedRelease.state.startsWith('done_')) {
            stopStagePolling();
            if (onTabChange) {
              onTabChange(); // Switch to history tab
            }
            return;
          }
        } else if (releaseResponse.status === 404) {
          // Release no longer exists - clear it and stop polling
          setActiveRelease(null);
          setReleaseStages([]);
          stopStagePolling();
          return;
        }

        // Poll each stage for updates
        const stagePromises = activeRelease.stages.map(async (stageRef) => {
          if (!stageRef.id) return null;
          
          try {
            const response = await fetch(`/api/stage/${stageRef.id}`);
            if (response.ok) {
              return await response.json() as ReleaseStage;
            }
          } catch (error) {
            console.warn(`Error polling stage ${stageRef.id}:`, error);
          }
          return null;
        });

        const stages = await Promise.all(stagePromises);
        const validStages = stages.filter((stage): stage is ReleaseStage => stage !== null);
        
        // Sort stages by order and update state
        validStages.sort((a, b) => a.order - b.order);
        setReleaseStages(validStages);
      } catch (error) {
        console.error('Error polling stages and release:', error);
      }
    }, 1000); // Poll every 1 second

    pollingIntervalRef.current = interval;
  };

  // Stop polling for stage updates
  const stopStagePolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Start elapsed time timer for dynamic updates
  const startElapsedTimeTimer = (release: Release) => {
    stopElapsedTimeTimer();
    
    if (!release.time_started) return;
    
    const startTime = new Date(release.time_started).getTime();
    
    const updateElapsedTime = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedTime(elapsed);
    };
    
    updateElapsedTime(); // Initial update
    elapsedTimeIntervalRef.current = setInterval(updateElapsedTime, 1000);
  };

  // Stop elapsed time timer
  const stopElapsedTimeTimer = () => {
    if (elapsedTimeIntervalRef.current) {
      clearInterval(elapsedTimeIntervalRef.current);
      elapsedTimeIntervalRef.current = null;
    }
    setElapsedTime(undefined);
  };

  const fetchStagesForRelease = async (release: Release) => {
    // Stop any existing polling
    stopStagePolling();
    
    if (!release.stages || release.stages.length === 0) {
      setReleaseStages([]);
      return;
    }

    try {
      setLoadingStages(true);
      const stagePromises = release.stages.map(async (stageRef) => {
        if (!stageRef.id) return null;
        
        try {
          const response = await fetch(`/api/stage/${stageRef.id}`);
          if (response.ok) {
            return await response.json() as ReleaseStage;
          } else {
            console.warn(`Failed to fetch stage ${stageRef.id}:`, response.statusText);
            return null;
          }
        } catch (error) {
          console.warn(`Error fetching stage ${stageRef.id}:`, error);
          return null;
        }
      });

      const stages = await Promise.all(stagePromises);
      const validStages = stages.filter((stage): stage is ReleaseStage => stage !== null);
      
      // Sort stages by order
      validStages.sort((a, b) => a.order - b.order);
      setReleaseStages(validStages);
      
      // Start polling for real-time updates
      startStagePolling();
    } catch (error) {
      console.error('Error fetching stages:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : 'Failed to fetch stages');
      }
    } finally {
      setLoadingStages(false);
    }
  };

  const checkActiveRelease = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/release/active');
      
      if (response.ok) {
        const release = await response.json();
        setActiveRelease(release);
        // Fetch stages for the active release
        await fetchStagesForRelease(release);
      } else if (response.status === 404) {
        // No active release found
        setActiveRelease(null);
        setReleaseStages([]);
        // Stop polling since there's no active release
        stopStagePolling();
      } else {
        throw new Error(`Failed to check active release: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error checking active release:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : 'Failed to check active release');
      }
    } finally {
      setLoading(false);
    }
  };

  const createRelease = async () => {
    try {
      setCreating(true);
      const response = await fetch('/api/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const newRelease = await response.json();
        setActiveRelease(newRelease);
        // Fetch stages for the new release
        await fetchStagesForRelease(newRelease);
        if (onReleaseStateChange) {
          onReleaseStateChange();
        }
      } else {
        throw new Error(`Failed to create release: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error creating release:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : 'Failed to create release');
      }
    } finally {
      setCreating(false);
    }
  };

  const deleteRelease = async () => {
    if (!activeRelease) return;
    
    try {
      setDeleting(true);
      const response = await fetch('/api/release/active', {
        method: 'DELETE',
      });

      if (response.ok) {
        setActiveRelease(null);
        setReleaseStages([]);
        // Stop polling when release is deleted
        stopStagePolling();
        if (onReleaseStateChange) {
          onReleaseStateChange();
        }
      } else {
        throw new Error(`Failed to delete release: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting release:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : 'Failed to delete release');
      }
    } finally {
      setDeleting(false);
    }
  };

  const startRelease = async () => {
    if (!activeRelease) return;
    
    try {
      setStarting(true);
      const response = await fetch('/api/release/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/text',
        },
        body: 'start',
      });

      if (response.ok) {
        // Release started successfully
        // Refresh the release data to get updated state
        await checkActiveRelease();
        // Notify parent component that release state has changed
        if (onReleaseStateChange) {
          onReleaseStateChange();
        }
      } else if (response.status === 404) {
        // No active release found
        if (onError) {
          onError('No active release found');
        }
      } else if (response.status === 400) {
        // Invalid command or release state
        if (onError) {
          onError('Cannot start release - invalid state or command');
        }
      } else {
        throw new Error(`Failed to start release: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error starting release:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : 'Failed to start release');
      }
    } finally {
      setStarting(false);
    }
  };

  const stopRelease = async () => {
    if (!activeRelease) return;
    
    try {
      setStopping(true);
      const response = await fetch('/api/release/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/text',
        },
        body: 'stop',
      });

      if (response.ok) {
        // Release stopped successfully
        // Refresh the release data to get updated state
        await checkActiveRelease();
        // Notify parent component that release state has changed
        if (onReleaseStateChange) {
          onReleaseStateChange();
        }
      } else if (response.status === 404) {
        // No active release found
        if (onError) {
          onError('No active release found');
        }
      } else if (response.status === 400) {
        // Invalid command or release state
        if (onError) {
          onError('Cannot stop release - invalid state or command');
        }
      } else {
        throw new Error(`Failed to stop release: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error stopping release:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : 'Failed to stop release');
      }
    } finally {
      setStopping(false);
    }
  };

  if (loading) {
    return (
      <div className="release-loading">
        <div className="loading-spinner"></div>
        <p>Checking for active release...</p>
      </div>
    );
  }

  if (!activeRelease) {
    return (
      <div className="release-empty">
        <div className="create-release-container">
          <h3>No Active Release</h3>
          <p>Create a release from your current plan to begin deployment.</p>
          <button 
            className="nice-button create-release-button"
            onClick={handleCreateRelease}
            disabled={creating}
          >
            {creating ? 'Creating Release...' : 'Create Release'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="release-active">
      <div className="release-header">
        <div className="release-info" style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '0.5em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
            <span className={`release-state ${activeRelease.state}`}>
              {formatReleaseState(activeRelease.state)}
            </span>
            <span className="release-id">ID: {activeRelease.id}</span>
          </div>
          <div className="release-timestamp">
            {activeRelease.state === 'not_started' && activeRelease.time_created && (
              <span className="timestamp-info">
                Created: {new Date(activeRelease.time_created).toLocaleString()}
              </span>
            )}
            {activeRelease.state === 'running' && (
              <div className="running-timestamps">
                {activeRelease.time_started && (
                  <span className="timestamp-info">
                    Started: {new Date(activeRelease.time_started).toLocaleString()}
                  </span>
                )}
                {(elapsedTime !== undefined || activeRelease.time_elapsed !== undefined) && (
                  <span className="timestamp-info">
                    Elapsed: {(() => {
                      const elapsed = elapsedTime !== undefined ? elapsedTime : activeRelease.time_elapsed!;
                      return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
                    })()}
                  </span>
                )}
              </div>
            )}
            {activeRelease.state.startsWith('done_') && (
              <div className="done-timestamps">
                {activeRelease.time_started && (
                  <span className="timestamp-info">
                    Started: {new Date(activeRelease.time_started).toLocaleString()}
                  </span>
                )}
                {activeRelease.time_done && (
                  <span className="timestamp-info">
                    Completed: {new Date(activeRelease.time_done).toLocaleString()}
                  </span>
                )}
                {activeRelease.time_elapsed !== undefined && (
                  <span className="timestamp-info">
                    Total time: {Math.floor(activeRelease.time_elapsed / 60)}m {activeRelease.time_elapsed % 60}s
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {activeRelease.state === 'not_started' && (
          <div style={{ display: 'flex', gap: '0.5em' }}>
            <button 
              className="nice-button start-release-button"
              onClick={startRelease}
              disabled={starting}
            >
              {starting ? 'Starting...' : 'Start'}
            </button>
            <button 
              className="nice-button delete-release-button"
              onClick={deleteRelease}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
        {activeRelease.state === 'running' && (
          <div style={{ display: 'flex', gap: '0.5em' }}>
            <button 
              className="nice-button stop-release-button"
              onClick={stopRelease}
              disabled={stopping}
            >
              {stopping ? 'Stopping...' : 'Stop'}
            </button>
          </div>
        )}
      </div>

      <div className="release-details">
      <div className="release-slos">
          <h4>SLOs</h4>
          <div className="slos-list">
            {activeRelease.plan_record.slos.map((slo, index) => (
              <div key={index} className="slo-item">
                <span className="slo-value">{slo.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="release-stages">
          <h4>Stages</h4>
          {loadingStages ? (
            <div>Loading stages...</div>
          ) : (
            <div className="stages-list">
              {activeRelease.plan_record.stages.map((planStage) => {
                const releaseStage = releaseStages.find(s => s.order === planStage.order);
                return (
                  <StageItem
                    key={planStage.order}
                    planStage={planStage}
                    releaseStage={releaseStage}
                    showStatus={true}
                    showSoakTime={true}
                    releaseState={activeRelease.state}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
