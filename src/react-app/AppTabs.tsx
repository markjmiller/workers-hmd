import React, { useState, useEffect, useRef } from 'react';
import { Release } from './Release';
import { History } from './History';
import './AppTabs.css';
import type { components } from "../../types/api";

type Release = components["schemas"]["Release"];

interface AppTabsProps {
  planEditor: React.ReactElement;
}

export const AppTabs: React.FC<AppTabsProps> = ({
  planEditor,
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'release' | 'history'>('plan');
  const [hasActiveRelease, setHasActiveRelease] = useState<boolean>(false);
  const [activeReleaseState, setActiveReleaseState] = useState<string | null>(null);
  const hasActiveReleaseRef = useRef<boolean>(false);

  // Check for active release function
  const checkActiveRelease = async () => {
    try {
      const currentHasActive = hasActiveReleaseRef.current;
      const response = await fetch('/api/release/active');
      
      if (response.ok) {
        const release = await response.json();
        
        hasActiveReleaseRef.current = true;
        setHasActiveRelease(true);
        setActiveReleaseState(release.state);
        // Auto-open Release tab if there's an active release (only on initial load)
        if (activeTab === 'plan') {
          setActiveTab('release');
        }
      } else {
        // No active release found
        
        // Check if we had an active release before and now we don't (release finished)
        if (currentHasActive) {
          // Release just finished, auto-open History tab
          setActiveTab('history');
        }
        
        hasActiveReleaseRef.current = false;
        setHasActiveRelease(false);
        setActiveReleaseState(null);
      }
    } catch (error) {
      console.error('Error checking active release:', error);
      hasActiveReleaseRef.current = false;
      setHasActiveRelease(false);
      setActiveReleaseState(null);
    }
  };

  // Check for active release on component mount and set up periodic polling
  useEffect(() => {
    // Initial check
    checkActiveRelease();
    
    // Set up periodic polling every 5 seconds
    const interval = setInterval(checkActiveRelease, 5000);
    
    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, [activeTab]);

  // Plan-related handlers have been moved to PlanEditor component

  const renderTabContent = () => {
    switch (activeTab) {
      case 'plan':
        return planEditor;
      case 'release':
        return (
          <div className="tab-content">
            <Release 
              onError={(error) => console.error('Release error:', error)} 
              onReleaseStateChange={checkActiveRelease}
            />
          </div>
        );
      case 'history':
        return (
          <div className="tab-content">
            <History onError={(error) => console.error('History error:', error)} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="plan-tabs">
      <div className="plan-tabs-header">
        {/* Save button moved to bottom of plan tab */}
      </div>
      
      <div className="tab-container">
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'plan' ? 'active' : ''} ${(activeReleaseState === 'not_started' || activeReleaseState === 'running') ? 'disabled' : ''}`}
            onClick={() => setActiveTab('plan')}
            disabled={activeReleaseState === 'not_started' || activeReleaseState === 'running'}
            title={activeReleaseState === 'not_started' || activeReleaseState === 'running' ? 'Plan cannot be modified while release is active' : ''}
          >
            Plan
          </button>
          <button
            className={`tab-button ${activeTab === 'release' ? 'active' : ''}`}
            onClick={() => setActiveTab('release')}
          >
            <div className="plan-tabs-status-container">
              <span>Release</span>
              {hasActiveRelease && (
                activeReleaseState === 'running' && (
                <span className={`tab-status-icon-running`} title="Release started">
                  🟢
                </span>
                )
                || (
                <span className={`tab-status-icon-staged`} title="Release staged">
                  🟡
                </span>
                )
            )}
            </div>
          </button>
          <button
            className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>
        
        <div className="tab-content-wrapper">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};
