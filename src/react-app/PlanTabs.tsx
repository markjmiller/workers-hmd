import React, { useState } from 'react';
import { ReleasePlanTable } from './ReleasePlanTable';
import type { components } from "../../types/api";

type Plan = components["schemas"]["Plan"];

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
  const [saveValidationError, setSaveValidationError] = useState<string>('');
  const [hasValidationErrors, setHasValidationErrors] = useState<boolean>(false);
  const getCurrentPlanRef = React.useRef<(() => Plan) | null>(null);

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
            />

            <hr style={{ marginTop: '16px', marginBottom: '16px' }}/>
            
            {onSave && (
              <div className="save-button-container">
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
                <button
                  onClick={handleSave}
                  className="save-button"
                  disabled={!!saveValidationError || hasValidationErrors}
                >
                  Save Plan
                </button>
              </div>
            )}
          </>
        );
      case 'release':
        return (
          <div className="tab-content">
            <h3>Release Management</h3>
            <p className="placeholder-text">Release controls and monitoring will be available here.</p>
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
            className={`tab-button ${activeTab === 'plan' ? 'active' : ''}`}
            onClick={() => setActiveTab('plan')}
          >
            Plan
          </button>
          <button
            className={`tab-button ${activeTab === 'release' ? 'active' : ''}`}
            onClick={() => setActiveTab('release')}
          >
            Release
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
