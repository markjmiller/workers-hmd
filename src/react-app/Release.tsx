import React, { useState, useEffect, useRef } from 'react';
import type { components } from '../../types/api';
import { StageItem } from './StageItem';
import { formatReleaseState, api, isReleaseComplete } from './utils';
import './Release.css';

type Release = components['schemas']['Release'];
type ReleaseStage = components['schemas']['ReleaseStage'];

interface ReleaseProps {
  onError?: (error: string) => void;
  onReleaseStateChange?: () => void;
  onTabChange?: () => void; // Called when user switches away from Release tab
}

export const Release: React.FC<ReleaseProps> = ({ onError, onReleaseStateChange, onTabChange }) => {
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const [releaseStages, setReleaseStages] = useState<ReleaseStage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingStages, setLoadingStages] = useState(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);
  const [oldVersion, setOldVersion] = useState<string>('');
  const [newVersion, setNewVersion] = useState<string>('');
  const [workerInfo, setWorkerInfo] = useState<{name: string, accountId: string} | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeReleaseRef = useRef<Release | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number | undefined>();

  // Check for active release on component mount and ensure polling starts
  useEffect(() => {
    const initializeRelease = async () => {
      await checkActiveRelease();
      // If there's an active release after checking, ensure polling is running
      // This helps with cases where the component remounts after tab switching
    };
    
    initializeRelease();
    
    // Load worker info from session storage
    const savedConnection = sessionStorage.getItem('workerConnection');
    if (savedConnection) {
      try {
        const connection = JSON.parse(savedConnection);
        setWorkerInfo({
          name: connection.workerName,
          accountId: connection.accountId
        });
      } catch (error) {
        console.error('Error parsing worker connection:', error);
      }
    }
  }, []);

  // Keep activeReleaseRef in sync with activeRelease state
  useEffect(() => {
    activeReleaseRef.current = activeRelease;
  }, [activeRelease]);

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
      // Use ref to get current activeRelease state - fixes closure issue after tab switching
      const currentActiveRelease = activeReleaseRef.current;
      if (!currentActiveRelease || !currentActiveRelease.stages) {
        return;
      }

      try {
        // First, poll the active release to get updated release state
        try {
          const updatedRelease = await api.getActiveRelease();
          setActiveRelease(updatedRelease);
          
          // Start/stop elapsed time timer based on release state
          if (updatedRelease.state === 'running') {
            startElapsedTimeTimer(updatedRelease);
          } else {
            stopElapsedTimeTimer();
          }
          
          // If release state changed to a done state, redirect to history tab
          if (isReleaseComplete(updatedRelease.state)) {
            stopStagePolling();
            if (onTabChange) {
              onTabChange(); // Switch to history tab
            }
            return;
          }
        } catch (error) {
          // Release no longer exists (404) - clear it and stop polling
          setActiveRelease(null);
          setReleaseStages([]);
          stopStagePolling();
          return;
        }

        // Poll each stage for updates - use current release from ref
        const stagePromises = currentActiveRelease.stages.map(async (stageRef) => {
          if (!stageRef.id) return null;
          
          try {
            return await api.getStage(stageRef.id) as ReleaseStage;
          } catch (error) {
            console.warn(`Error polling stage ${stageRef.id}:`, error);
            return null;
          }
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
          return await api.getStage(stageRef.id) as ReleaseStage;
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
      const release = await api.getActiveRelease();
      
      if (release) {
        // Active release found
        setActiveRelease(release);
        
        // Start elapsed time timer if release is running
        if (release.state === 'running') {
          startElapsedTimeTimer(release);
        }
        
        // Fetch stages for the active release
        await fetchStagesForRelease(release);
        
        // Ensure polling is started - this is critical for tab switching
        // We start polling after setting state to avoid race conditions
        setTimeout(() => {
          if (release.stages && release.stages.length > 0) {
            startStagePolling();
          }
        }, 100);
      } else {
        // No active release found
        setActiveRelease(null);
        setReleaseStages([]);
        stopStagePolling();
      }
    } catch (error) {
      // Handle actual API errors (network issues, server errors, etc.)
      setActiveRelease(null);
      setReleaseStages([]);
      stopStagePolling();
      
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
      // Create release with version UUIDs
      const releaseData = {
        old_version: oldVersion,
        new_version: newVersion
      };
      const newRelease = await api.createRelease(releaseData);
      setActiveRelease(newRelease);
      // Clear the input fields after successful creation
      setOldVersion('');
      setNewVersion('');
      // Fetch stages for the new release
      await fetchStagesForRelease(newRelease);
      if (onReleaseStateChange) {
        onReleaseStateChange();
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
      await api.deleteActiveRelease();
      setActiveRelease(null);
      setReleaseStages([]);
      // Stop polling when release is deleted
      stopStagePolling();
      if (onReleaseStateChange) {
        onReleaseStateChange();
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
      await api.startRelease();
      // Release started successfully
      // Refresh the release data to get updated state
      await checkActiveRelease();
      // Notify parent component that release state has changed
      if (onReleaseStateChange) {
        onReleaseStateChange();
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
      await api.stopRelease();
      // Release stopped successfully
      // Refresh the release data to get updated state
      await checkActiveRelease();
      // Notify parent component that release state has changed
      if (onReleaseStateChange) {
        onReleaseStateChange();
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
          
          {workerInfo && (
            <div className="card-info">
              <p style={{ fontSize: '1em', margin: '0' }}>{workerInfo.name}</p>
            </div>
          )}
          
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="oldVersion" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', textAlign: 'left', fontFamily: 'monospace' }}>
                Old Version *
              </label>
              <input
                type="text"
                id="oldVersion"
                value={oldVersion}
                onChange={(e) => setOldVersion(e.target.value)}
                placeholder="ae731ba815074b9b9f11c91d3983082d"
                style={{ 
                  fontFamily: 'monospace',
                  width: '100%', 
                  padding: '0.5rem', 
                  border: '1px solid #ccc', 
                  borderRadius: '4px',
                  maxWidth: '400px'
                }}
                disabled={creating}
                required
              />
            </div>
            
            <div style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="newVersion" style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500', textAlign: 'left', fontFamily: 'monospace' }}>
                New Version *
              </label>
              <input
                type="text"
                id="newVersion"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
                placeholder="b6615a5d968147878ff10627dbc153d4"
                style={{ 
                  fontFamily: 'monospace',
                  width: '100%', 
                  padding: '0.5rem', 
                  border: '1px solid #ccc', 
                  borderRadius: '4px',
                  maxWidth: '400px'
                }}
                disabled={creating}
                required
              />
            </div>
          </div>
          
          <button 
            className="nice-button create-release-button"
            onClick={handleCreateRelease}
            disabled={creating || !oldVersion || !newVersion}
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
        <div className="release-info">
          <div style={{ display: 'flex', flexDirection: 'row', gap: '0.5em', alignItems: 'baseline' }}>
            <span className={`release-state ${activeRelease.state}`}>
              {formatReleaseState(activeRelease.state)}
            </span>
            <span className="release-id" style={{ marginLeft: '0.5em' }}>ID: {activeRelease.id}</span>
          </div>
          {/* Worker and Version Information */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1em', fontSize: '0.9em', color: '#666', backgroundColor: '#f8f9fa', padding: '0.75em', borderRadius: '4px', }}>
            {workerInfo && (
              <span style={{ fontSize: '1.2em' }}><strong>{workerInfo.name}</strong></span>
            )}
            {activeRelease.old_version && (
              <span style={{ fontSize: '0.875em' }}><strong>Old Version:</strong> <span style={{ fontFamily: 'monospace' }}>{activeRelease.old_version}</span></span>
            )}
            {activeRelease.new_version && (
              <span style={{ fontSize: '0.875em' }}><strong>New Version:</strong> <span style={{ fontFamily: 'monospace' }}>{activeRelease.new_version}</span></span>
            )}
          </div>
          <div className="release-timestamp" style={{ marginLeft: '0.5em' }}>
            {activeRelease.state === 'not_started' && activeRelease.time_created && (
              <span className="timestamp-info">
                Created: {new Date(activeRelease.time_created).toLocaleString()}
              </span>
            )}
            {activeRelease.state === 'running' && (
              <div className="running-timestamps" style={{ marginLeft: '0.5em' }}>
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
