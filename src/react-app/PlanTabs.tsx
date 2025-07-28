import React, { useState, useEffect } from 'react';
import { ReleasePlanTable } from './ReleasePlanTable';
import { Release } from './Release';
import './PlanTabs.css';
import type { components } from "../../types/api";

type Plan = components["schemas"]["Plan"];
type Release = components["schemas"]["Release"];

interface PlanTabsProps {
  initialPlan: Plan;
  onSave?: (plan: Plan) => void;
  saveSuccess?: boolean;
}

export const PlanTabs: React.FC<PlanTabsProps> = ({
  initialPlan,
  onSave,
  saveSuccess = false,
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'release' | 'history'>('plan');
  const [hasActiveRelease, setHasActiveRelease] = useState<boolean>(false);
  const [activeReleaseState, setActiveReleaseState] = useState<string | null>(null);
  const [saveValidationError, setSaveValidationError] = useState<string>('');
  const [hasValidationErrors, setHasValidationErrors] = useState<boolean>(false);
  const [showJsonView, setShowJsonView] = useState<boolean>(false);
  const getCurrentPlanRef = React.useRef<(() => Plan) | null>(null);

  // Check for active release function
  const checkActiveRelease = async () => {
    try {
      const response = await fetch('/api/release/active');
      if (response.ok) {
        const release = await response.json();
        setHasActiveRelease(true);
        setActiveReleaseState(release.state);
        // Auto-open Release tab if there's an active release (only on initial load)
        if (activeTab === 'plan') {
          setActiveTab('release');
        }
      } else {
        // No active release found
        setHasActiveRelease(false);
        setActiveReleaseState(null);
      }
    } catch (error) {
      console.error('Error checking active release:', error);
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

  const handleSave = () => {
    // Clear any previous validation errors
    setSaveValidationError('');
    
    // Get current plan data from the ReleasePlanTable component
    if (!getCurrentPlanRef.current) {
      setSaveValidationError('Unable to get current plan data');
      return;
    }
    
    const currentPlan = getCurrentPlanRef.current();
    
    // Validate stages
    const sortedStages = [...currentPlan.stages].sort((a, b) => a.order - b.order);
    
    // Ensure percentages are in ascending order
    for (let i = 1; i < sortedStages.length; i++) {
      if (sortedStages[i].target_percent <= sortedStages[i - 1].target_percent) {
        setSaveValidationError(`Stage ${i + 1} must have a higher target percentage than stage ${i}`);
        return;
      }
    }

    const plan: Plan = {
      stages: sortedStages,
      slos: currentPlan.slos,
    };

    console.log('Saving plan:', JSON.stringify(plan, null, 2));
    
    if (onSave) {
      onSave(plan);
    }
  };

  const handleGetCurrentPlan = (getCurrentPlan: () => Plan) => {
    getCurrentPlanRef.current = getCurrentPlan;
  };

  const handleValidationChange = (hasErrors: boolean) => {
    setHasValidationErrors(hasErrors);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'plan':
        return (
          <>
            {saveValidationError && (
              <div className="save-validation-error">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{saveValidationError}</span>
              </div>
            )}
            
            <ReleasePlanTable
              initialPlan={initialPlan}
              onGetCurrentPlan={handleGetCurrentPlan}
              onValidationChange={handleValidationChange}
              showJsonView={showJsonView}
            />

            <hr className="plan-tabs-separator"/>
            
            <div className="plan-tabs-bottom-container">
              <div className="plan-tabs-bottom-left">
                {saveSuccess && (
                  <div className="save-success">
                    <span className="success-icon">✅</span>
                    <span className="success-message">Plan saved successfully!</span>
                  </div>
                )}
                {saveValidationError && (
                  <div className="save-validation-error">
                    <span className="error-icon">⚠️</span>
                    <span className="error-message">{saveValidationError}</span>
                  </div>
                )}
              </div>
              <div className="plan-tabs-bottom-right">
                <label className="plan-tabs-json-label">
                  <input 
                    type="checkbox" 
                    checked={showJsonView}
                    onChange={(e) => setShowJsonView(e.target.checked)}
                  />
                  Show JSON
                </label>
                <button
                  onClick={handleSave}
                  className="nice-button"
                  disabled={!!saveValidationError || hasValidationErrors}
                >
                Save Plan
                </button>
              </div>
            </div>
            {initialPlan.time_last_saved && (
                  <div className="plan-tabs-time-saved">
                    Last saved: {new Date(initialPlan.time_last_saved).toLocaleString()}
                  </div>
                )}
          </>
        );
      case 'release':
        return (
          <div className="tab-content">
            <Release 
              onError={(error) => setSaveValidationError(error)} 
              onReleaseStateChange={checkActiveRelease}
            />
          </div>
        );
      case 'history':
        return (
          <div className="tab-content">
            <h3>Release History</h3>
            <p className="placeholder-text">Past release information and logs will be displayed here.</p>
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
                <span className={`tab-status-icon-${activeReleaseState}`} title="Release staged">
                  🟢
                </span>
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
