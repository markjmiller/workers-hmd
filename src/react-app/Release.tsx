import React, { useState, useEffect } from 'react';
import type { components } from '../../types/api';
import './Release.css';

type Release = components['schemas']['Release'];

interface ReleaseProps {
  onError?: (error: string) => void;
  onReleaseStateChange?: () => void;
}

export const Release: React.FC<ReleaseProps> = ({ onError, onReleaseStateChange }) => {
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);

  // Check for active release on component mount
  useEffect(() => {
    checkActiveRelease();
  }, []);

  const checkActiveRelease = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/release/active');
      
      if (response.ok) {
        const release = await response.json();
        setActiveRelease(release);
      } else if (response.status === 404) {
        // No active release found - this is expected
        setActiveRelease(null);
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
        // Notify parent component that release state has changed
        if (onReleaseStateChange) {
          onReleaseStateChange();
        }
      } else if (response.status === 409) {
        // Release already staged
        if (onError) {
          onError('A release is already staged');
        }
        // Refresh to get the current active release
        await checkActiveRelease();
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
      const response = await fetch(`/api/release/${activeRelease.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Release deleted successfully
        setActiveRelease(null);
        // Notify parent component that release state has changed
        if (onReleaseStateChange) {
          onReleaseStateChange();
        }
        // Refresh to check if there are any other releases
        await checkActiveRelease();
      } else if (response.status === 409) {
        // Release cannot be deleted
        if (onError) {
          onError('Release cannot be deleted - must be in "not_started" state');
        }
      } else if (response.status === 404) {
        // Release not found
        if (onError) {
          onError('Release not found');
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
      const response = await fetch(`/api/release/${activeRelease.id}`, {
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
        // Release not found
        if (onError) {
          onError('Release not found');
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
      const response = await fetch(`/api/release/${activeRelease.id}`, {
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
        // Release not found
        if (onError) {
          onError('Release not found');
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
            onClick={createRelease}
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
              {activeRelease.state.replace('_', ' ').toUpperCase()}
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
                {activeRelease.time_elapsed !== undefined && (
                  <span className="timestamp-info">
                    Elapsed: {Math.floor(activeRelease.time_elapsed / 60)}m {activeRelease.time_elapsed % 60}s
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
          <div className="stages-list">
            {activeRelease.plan_record.stages.map((planStage) => {
              const releaseStage = activeRelease.stages?.find(s => s.order === planStage.order);
              return (
                <div key={planStage.order} className="release-stage-item">
                  <div className="stage-info">
                    <span className="stage-number">Stage {planStage.order + 1}</span>
                    <span className="stage-target">{planStage.target_percent}%</span>
                    <span className="stage-description">{planStage.description || 'No description'}</span>
                  </div>
                  {releaseStage && (
                    <div className="stage-status">
                      <span className={`stage-state ${releaseStage.state}`}>
                        {releaseStage.state.toUpperCase()}
                      </span>
                      {releaseStage.time_elapsed > 0 && (
                        <span className="stage-time">
                          {Math.floor(releaseStage.time_elapsed / 60)}m
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
