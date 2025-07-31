import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TimeInput } from "./TimeInput";
import { PlanStage } from "./types";

interface SortableStageRowProps {
  stage: PlanStage;
  onUpdate: (order: number, updatedStage: Partial<PlanStage>) => void;
  onRemove: (order: number) => void;
  isLastStage?: boolean;
  validationError?: string;
  soakValidationError?: string;
}

export const SortableStageRow: React.FC<SortableStageRowProps> = ({
  stage,
  onUpdate,
  onRemove,
  isLastStage = false,
  validationError,
  soakValidationError,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.order });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleInputChange = (field: keyof PlanStage, value: any) => {
    onUpdate(stage.order, { [field]: value });
  };

  const handleTargetPercentChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    // Don't allow changes to target percent for the last stage
    if (isLastStage) {
      return;
    }

    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      handleInputChange("target_percent", value);
    }
  };

  const handleAutoProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange("auto_progress", e.target.checked);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange("description", e.target.value);
  };

  const handleSoakTimeChange = (seconds: number) => {
    onUpdate(stage.order, { soak_time: seconds });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`table-row ${isDragging ? "dragging" : ""} ${isLastStage ? "last-stage" : ""}`}
    >
      <div className="col-order">
        <div
          className={`drag-handle ${isLastStage ? "disabled" : ""}`}
          {...(isLastStage ? {} : attributes)}
          {...(isLastStage ? {} : listeners)}
          title={isLastStage ? "Final stage (locked)" : "Drag to reorder"}
        >
          {isLastStage ? "🔒" : "⋮⋮"}
        </div>
        <span className="stage-number">{stage.order}</span>
      </div>

      <div className="col-percent">
        <div className="input-container">
          <input
            type="number"
            min="0"
            max="100"
            value={stage.target_percent}
            onChange={handleTargetPercentChange}
            className={`percent-input ${isLastStage ? "locked" : ""} ${validationError ? "error" : ""}`}
            readOnly={isLastStage}
            title={isLastStage ? "Final stage is locked at 100%" : ""}
          />
          <span>%</span>
          {validationError && (
            <div className="validation-error">{validationError}</div>
          )}
        </div>
      </div>

      <div className="col-soak">
        <div className="input-container">
          <TimeInput
            value={stage.soak_time}
            onChange={handleSoakTimeChange}
            className="soak-input"
            error={!!soakValidationError}
            min={1}
          />
          {soakValidationError && (
            <div className="validation-error">{soakValidationError}</div>
          )}
        </div>
      </div>

      {!isLastStage && (
        <div className="col-auto">
          <input
            type="checkbox"
            checked={stage.auto_progress}
            onChange={handleAutoProgressChange}
            className="auto-checkbox"
          />
        </div>
      )}

      {!isLastStage && (
        <div className="col-description">
          <input
            type="text"
            value={stage.description || ""}
            onChange={handleDescriptionChange}
            placeholder="description..."
            className="description-input"
          />
        </div>
      )}

      {!isLastStage && (
        <div className="col-actions">
          <button
            onClick={() => onRemove(stage.order)}
            className="remove-button"
            title="Remove stage"
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      )}
    </div>
  );
};
