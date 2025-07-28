import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToWindowEdges,
} from '@dnd-kit/modifiers';
import { SortableStageRow } from './SortableStageRow.tsx';
import type { components } from "../../types/api";

type Plan = components["schemas"]["Plan"];
type PlanStage = components["schemas"]["PlanStage"];
type SLO = components["schemas"]["SLO"];

interface ReleasePlanTableProps {
  initialPlan: Plan;
  onGetCurrentPlan?: (getCurrentPlan: () => Plan) => void;
  onValidationChange?: (hasErrors: boolean) => void;
  showJsonView?: boolean;
}

export const ReleasePlanTable: React.FC<ReleasePlanTableProps> = ({
  initialPlan,
  onGetCurrentPlan,
  onValidationChange,
  showJsonView = false,
}) => {
  const [stages, setStages] = useState<PlanStage[]>(
    initialPlan.stages
  );
  const [slos, setSlos] = useState<SLO[]>(initialPlan.slos);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [sloValidationErrors, setSloValidationErrors] = useState<Record<number, string>>({});
  const [jsonRepresentation, setJsonRepresentation] = useState<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Validation function to check target percentages and soak times
  const validateStages = (updatedStages: PlanStage[]) => {
    const errors: Record<string, string> = {};
    const sortedStages = [...updatedStages].sort((a, b) => a.order - b.order);
    const maxOrder = Math.max(...sortedStages.map(s => s.order));
    
    for (let i = 0; i < sortedStages.length; i++) {
      const currentStage = sortedStages[i];
      const isLastStage = currentStage.order === maxOrder;
      
      // Check soak time validation
      if (currentStage.soak_time <= 0) {
        errors[`${currentStage.order}_soak`] = 'Soak time must be greater than 0';
      }
      
      // Check if non-final stage has 100% target
      if (!isLastStage && currentStage.target_percent == 100) {
        errors[currentStage.order] = 'Only the final stage can be 100%';
      }

      if (isLastStage) { continue; }
      
      // Check ascending order (skip first stage)
      if (i > 0) {
        const previousStage = sortedStages[i - 1];
        if (currentStage.target_percent == 100) {
          errors[currentStage.order] = 'Only the final stage can be 100%';
        }
        else if (currentStage.target_percent <= previousStage.target_percent) {
          errors[currentStage.order] = `Must be higher than ${previousStage.target_percent}%`;
        }
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Validation function to check SLOs are not empty
  const validateSLOs = (slosToValidate: SLO[]) => {
    const errors: Record<number, string> = {};
    
    slosToValidate.forEach((slo, index) => {
      if (!slo.value || slo.value.trim() === '') {
        errors[index] = 'SLO cannot be empty';
      }
    });
    
    setSloValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setStages((items) => {
        const oldIndex = items.findIndex(
          (item) => item.order === active.id
        );
        const newIndex = items.findIndex(
          (item) => item.order === over!.id
        );

        const reorderedItems = arrayMove(items, oldIndex, newIndex);
        
        // Update order values to match new positions
        const newStages = reorderedItems.map((item, index) => ({
          ...item,
          order: index,
        }));
        
        // Validate stages after reordering
        setTimeout(() => validateStages(newStages), 0);
        
        return newStages;
      });
    }
  };

  const updateStage = (order: number, updatedStage: Partial<PlanStage>) => {
    setStages(prevStages => {
      const maxOrder = Math.max(...prevStages.map(s => s.order));
      const isLastStage = order === maxOrder;
      
      const newStages = prevStages.map(stage => {
        if (stage.order === order) {
          // For the last stage, don't allow target_percent changes - keep it at 100
          if (isLastStage && 'target_percent' in updatedStage) {
            return { ...stage, ...updatedStage, target_percent: 100 };
          }
          return { ...stage, ...updatedStage };
        }
        return stage;
      });
      
      // Validate stages after update
      setTimeout(() => validateStages(newStages), 0);
      
      return newStages;
    });
  };

  const addStage = () => {
    const maxOrder = Math.max(...stages.map(s => s.order));
    // Insert the new stage before the last one
    const newStage: PlanStage = {
      order: maxOrder - 1, // This will be the new second-to-last stage
      description: "",
      target_percent: stages[maxOrder - 1].target_percent + 1, // Start at 1% higher than the previous stage
      soak_time: 60,
      auto_progress: false,
    };

    // Reorder all stages and ensure the last one is at 100%
    const updatedStages = [...stages.slice(0, maxOrder), newStage, ...stages.slice(maxOrder)]
      .map((stage, index) => ({
        ...stage,
        order: index,
        target_percent: index === stages.length ? 100 : stage.target_percent, // Last stage (new length) is 100%
      }));
    
    setStages(updatedStages);
  };

  const removeStage = (order: number) => {
    if (stages.length <= 1) {
      alert('Cannot remove the last stage');
      return;
    }
    
    const maxOrder = Math.max(...stages.map(s => s.order));
    
    // Prevent removing the last stage (which should always be 100%)
    if (order === maxOrder) {
      alert('Cannot remove the final stage (100% target)');
      return;
    }
    
    const filteredStages = stages.filter(stage => stage.order !== order);
    // Reorder remaining stages and ensure last stage is 100%
    const reorderedStages = filteredStages.map((stage, index) => ({
      ...stage,
      order: index,
    }));
    
    // Set the new last stage to 100%
    if (reorderedStages.length > 0) {
      reorderedStages[reorderedStages.length - 1].target_percent = 100;
    }
    
    setStages(reorderedStages);
    
    // Validate stages after removal
    setTimeout(() => validateStages(reorderedStages), 0);
  };

  // SLO management functions
  const addSlo = () => {
    const newSlo: SLO = { value: '' };
    const updatedSlos = [...slos, newSlo];
    setSlos(updatedSlos);
    
    // Validate SLOs after adding
    setTimeout(() => validateSLOs(updatedSlos), 0);
  };

  const removeSlo = (index: number) => {
    if (slos.length <= 1) {
      return; // Don't remove if only one SLO exists
    }
    const updatedSlos = slos.filter((_, i) => i !== index);
    setSlos(updatedSlos);
    
    // Validate SLOs after removal
    setTimeout(() => validateSLOs(updatedSlos), 0);
  };

  const updateSlo = (index: number, value: string) => {
    const updatedSlos = slos.map((slo, i) => 
      i === index ? { ...slo, value } : slo
    );
    setSlos(updatedSlos);
    
    // Validate SLOs after update
    setTimeout(() => validateSLOs(updatedSlos), 0);
  };

  // Initialize validation on mount
  React.useEffect(() => {
    validateSLOs(slos);
    validateStages(stages);
  }, []); // Only run on mount

  // Expose method to get current plan state (called by parent when saving)
  const getCurrentPlan = React.useCallback((): Plan => {
    return {
      stages: [...stages].sort((a, b) => a.order - b.order),
      slos,
    };
  }, [stages, slos]);

  // Check if there are any validation errors
  const hasValidationErrors = React.useCallback(() => {
    return Object.keys(validationErrors).length > 0 || Object.keys(sloValidationErrors).length > 0;
  }, [validationErrors, sloValidationErrors]);

  // Notify parent of validation state changes
  React.useEffect(() => {
    if (onValidationChange) {
      onValidationChange(hasValidationErrors());
    }
  }, [hasValidationErrors, onValidationChange]);

  // Pass the getCurrentPlan function to parent on mount
  React.useEffect(() => {
    if (onGetCurrentPlan) {
      onGetCurrentPlan(getCurrentPlan);
    }
  }, [getCurrentPlan, onGetCurrentPlan]);

  // Update JSON representation whenever stages or slos change
  React.useEffect(() => {
    const currentPlan = getCurrentPlan();
    setJsonRepresentation(JSON.stringify(currentPlan, null, 2));
  }, [stages, slos, getCurrentPlan]);

  return (
    <div>
      {!showJsonView ? (
        <div className="release-plan-form">
        <div className="slos-section">
          <h3 className="section-heading">SLOs</h3>
          <div className="slo-entry-container">
          {slos.map((slo, index) => (
            <div key={index} className="slo-entry">
              <div className="slo-input-container">
                <div className="slo-textarea-container">
                  <textarea
                    value={slo.value}
                    onChange={(e) => updateSlo(index, e.target.value)}
                    placeholder="latency p999 < 100ms, 5xx error rate < 0.1%, etc..."
                    className={`slo-textarea ${sloValidationErrors[index] ? 'error' : ''}`}
                    rows={3}
                  />
                  {sloValidationErrors[index] && (
                    <div className="validation-error">
                      <span className="error-icon">⚠️</span>
                      <span className="error-message">{sloValidationErrors[index]}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeSlo(index)}
                  className={`slo-remove-button ${slos.length <= 1 ? 'disabled' : ''}`}
                  title={slos.length <= 1 ? 'Cannot remove last SLO' : 'Remove SLO'}
                  disabled={slos.length <= 1}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
          </div>
          <div className="button-container-left">
            <button
              onClick={addSlo}
              className="nice-button"
            >
              + Add SLO
            </button>
          </div>
        </div>

        <div className="stages-section">
          <h3 className="section-heading">Stages</h3>
          <div className="table-container">
            <div className="table-header">
              <div className="col-order">Order</div>
              <div className="col-percent">Target %</div>
              <div className="col-soak">Soak Time</div>
              <div className="col-auto">Auto Progress</div>
              <div className="col-description">Description</div>
              <div className="col-actions"></div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
            >
              <SortableContext
                items={stages.filter(stage => {
                  const maxOrder = Math.max(...stages.map(s => s.order));
                  return stage.order !== maxOrder; // Exclude last stage from draggable items
                }).map(stage => stage.order)}
                strategy={verticalListSortingStrategy}
              >
                {stages
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => {
                    const maxOrder = Math.max(...stages.map(s => s.order));
                    const isLastStage = stage.order === maxOrder;
                    return (
                      <SortableStageRow
                        key={stage.order}
                        stage={stage}
                        onUpdate={updateStage}
                        onRemove={removeStage}
                        isLastStage={isLastStage}
                        validationError={validationErrors[stage.order]}
                        soakValidationError={validationErrors[`${stage.order}_soak`]}
                      />
                    );
                  })}
              </SortableContext>
            </DndContext>
          </div>

          <div className="action-buttons">
            <div className="button-container-left">
              <button
                onClick={addStage}
                className="nice-button"
              >
                + Add Stage
              </button>
            </div>
          </div>
        </div>
      </div>
      ) : (
        <div className="release-plan-json">
          <pre className="json-display">
            <code>{jsonRepresentation}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
