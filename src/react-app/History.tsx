import React, { useState, useEffect } from 'react';
import type { components } from '../../types/api';
import { StageItem } from './StageItem';
import './History.css';

type Release = components["schemas"]["Release"];

interface HistoryProps {
  onError?: (error: string) => void;
}

export const History: React.FC<HistoryProps> = ({ onError }) => {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [hasMoreResults, setHasMoreResults] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  useEffect(() => {
    fetchReleaseHistory(true);
  }, []);

  const fetchReleaseHistory = async (resetPage = false, pageNum?: number) => {
    try {
      const targetPage = resetPage ? 0 : (pageNum !== undefined ? pageNum : currentPage);
      const isInitialLoad = resetPage || targetPage === 0;
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const offset = resetPage ? 0 : targetPage * 10;
      const queryParams = new URLSearchParams({
        limit: '11', // Fetch 11 to check if there are more results
        offset: offset.toString(),
        // Only show completed releases by filtering out active states
        // Note: We'll filter these on the client side since the API doesn't support NOT operators
      });
      
      const response = await fetch(`/api/release?${queryParams}`);
      
      if (response.ok) {
        const releaseHistory = await response.json();
        // Filter out active releases (not_started, running) to show only completed releases
        const completedReleases = releaseHistory.filter((release: Release) => 
          release.state !== "not_started" && release.state !== "running"
        );
        
        // Check if there are more results (we fetched 11, so if we have 11+ completed releases, there are more)
        const hasMore = completedReleases.length > 10;
        const displayReleases = completedReleases.slice(0, 10);
        
        if (resetPage) {
          setReleases(displayReleases);
          setCurrentPage(0);
        } else {
          setReleases(prev => [...prev, ...displayReleases]);
          if (pageNum !== undefined) {
            setCurrentPage(pageNum);
          }
        }
        
        setHasMoreResults(hasMore);
      } else {
        throw new Error(`Failed to fetch release history: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching release history:', error);
      if (onError) {
        onError(error instanceof Error ? error.message : 'Failed to fetch release history');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const getStateDisplayName = (state: string) => {
    switch (state) {
      case 'not_started':
        return 'Not Started';
      case 'running':
        return 'Running';
      case 'done_successful':
        return 'Successful';
      case 'done_stopped_manually':
        return 'Stopped Manually';
      case 'done_failed_slo':
        return 'Failed SLO';
      default:
        return state.replace(/_/g, ' ').toUpperCase();
    }
  };

  const getStateColor = (state: string) => {
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

  const loadMore = async () => {
    if (!hasMoreResults || loadingMore) return;
    
    const nextPage = currentPage + 1;
    await fetchReleaseHistory(false, nextPage);
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  if (loading) {
    return (
      <div className="history-loading">
        <div className="loading-spinner"></div>
        <p>Loading release history...</p>
      </div>
    );
  }

  if (releases.length === 0) {
    return (
      <div className="history-empty">
        <h3>No Release History</h3>
        <p>No completed releases found.</p>
      </div>
    );
  }

  return (
    <div className="history-container">
      <div className="history-list">
        {releases.map((release) => (
          <div key={release.id} className="history-item">
            <div className="history-header">
              <div className="history-info">
                <span 
                  className="history-state"
                  style={{ backgroundColor: getStateColor(release.state) }}
                >
                  {getStateDisplayName(release.state)}
                </span>
                <span className="history-id">ID: {release.id}</span>
                {release.time_elapsed !== undefined && (
                  <div style={{ display: 'flex', gap: '0.5em', alignItems: 'baseline' }}>
                    <span className='stat-label'>Duration:</span>
                    <span className="stat-value">{formatDuration(release.time_elapsed)}</span>
                  </div>
                )}
              </div>
              <div className="history-timestamps">
                {release.time_created && (
                  <span className="history-timestamp">
                    Created: {new Date(release.time_created).toLocaleString()}
                  </span>
                )}
                {release.time_started && (
                  <span className="history-timestamp">
                    Started: {new Date(release.time_started).toLocaleString()}
                  </span>
                )}
                {release.time_done && (
                  <span className="history-timestamp">
                    Completed: {new Date(release.time_done).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            
            <div className="history-details">
              <div className="history-slos">
                <h4>SLOs</h4>
                <div className="slos-grid">
                  {release.plan_record.slos.map((slo, index) => (
                    <div key={index} className="slo-item">
                      {slo.value}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="history-stages">
                <h4>Stages</h4>
                <div className="stages-grid">
                  {release.plan_record.stages.map((planStage) => (
                    <StageItem
                      key={planStage.order}
                      planStage={planStage}
                      showStatus={false}
                      showSoakTime={true}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Pagination Controls */}
      {(hasMoreResults || loadingMore) && (
        <div className="pagination-controls">
          {loadingMore ? (
            <div className="loading-more">
              <span>Loading more releases...</span>
            </div>
          ) : (
            <button 
              onClick={loadMore} 
              className="nice-button"
              disabled={!hasMoreResults}
            >
              Load More Releases
            </button>
          )}
        </div>
      )}
    </div>
  );
};
