import React from 'react';
import type { components } from '../../types/api';

type PlanStage = components['schemas']['PlanStage'];
type ReleaseStage = components['schemas']['ReleaseStage'];

interface StageItemProps {
  planStage: PlanStage;
  releaseStage?: ReleaseStage;
  showStatus?: boolean;
  showSoakTime?: boolean;
}

export const StageItem: React.FC<StageItemProps> = ({ 
  planStage, 
  releaseStage, 
  showStatus = false,
  showSoakTime = false 
}) => {
  return (
    <div className="release-stage-item">
      <div className="stage-info">
        <span className="stage-number">{planStage.order + 1}</span>
        <span className="stage-target">{planStage.target_percent}%</span>
        {showSoakTime && (
          <span className="stage-soak">{planStage.soak_time}s</span>
        )}
        <span className="stage-description">{planStage.description}</span>
      </div>
      {showStatus && releaseStage && (
        <div className="stage-status">
          {planStage.auto_progress && (
            <span className="stage-auto-progress" title="Auto progress enabled">Auto Progress</span>
          )}
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
      {planStage.auto_progress && !showStatus && (
        <span className="stage-auto-progress" title="Auto progress enabled">Auto Progress</span>
      )}
    </div>
  );
};
