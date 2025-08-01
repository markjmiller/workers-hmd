import React, { useState, useEffect } from "react";
import { ReleasePlanTable } from "./ReleasePlanTable";
import { WorkerInfo } from "./WorkerInfo";
import { api } from "./utils";
import { useWorkerConnection } from "./hooks/useWorkerConnection";
import { EmptyState } from "./components/EmptyState";
import type { components } from "../../types/api";

type Plan = components["schemas"]["Plan"];

// PlanEditor component to handle all plan-specific logic
interface PlanEditorProps {
  plan: Plan;
  onSave: (plan: Plan) => void;
  saveSuccess: boolean;
}

const PlanEditor: React.FC<PlanEditorProps> = ({
  plan,
  onSave,
  saveSuccess,
}) => {
  const [saveValidationError, setSaveValidationError] = useState<string>("");
  const [hasValidationErrors, setHasValidationErrors] =
    useState<boolean>(false);
  const [showJsonView, setShowJsonView] = useState<boolean>(false);
  const [workerInfo, setWorkerInfo] = useState<{
    name: string;
    accountId: string;
  } | null>(null);
  const getCurrentPlanRef = React.useRef<(() => Plan) | null>(null);

  // Load worker info from session storage on component mount
  React.useEffect(() => {
    const savedConnection = sessionStorage.getItem("workerConnection");
    if (savedConnection) {
      try {
        const connection = JSON.parse(savedConnection);
        setWorkerInfo({
          name: connection.workerName,
          accountId: connection.accountId,
        });
      } catch (error) {
        console.error("Error parsing worker connection:", error);
      }
    }
  }, []);

  const handleGetCurrentPlan = (getCurrentPlan: () => Plan) => {
    getCurrentPlanRef.current = getCurrentPlan;
  };

  const handleValidationChange = (hasErrors: boolean) => {
    setHasValidationErrors(hasErrors);
  };

  const handleSave = () => {
    // Clear any previous validation errors
    setSaveValidationError("");

    // Get current plan data from the ReleasePlanTable component
    if (!getCurrentPlanRef.current) {
      setSaveValidationError("Unable to get current plan data");
      return;
    }

    const currentPlan = getCurrentPlanRef.current();

    // Validate stages
    const sortedStages = [...currentPlan.stages].sort(
      (a, b) => a.order - b.order,
    );

    // Ensure percentages are in ascending order
    for (let i = 1; i < sortedStages.length; i++) {
      if (
        sortedStages[i].target_percent <= sortedStages[i - 1].target_percent
      ) {
        setSaveValidationError(
          `Stage ${i + 1} must have a higher target percentage than stage ${i}`,
        );
        return;
      }
    }

    const validatedPlan: Plan = {
      stages: sortedStages,
      slos: currentPlan.slos,
      worker_name: currentPlan.worker_name,
      polling_fraction: currentPlan.polling_fraction,
    };

    onSave(validatedPlan);
  };

  return (
    <>
      {/* Worker Info Display */}
      {workerInfo && (
        <WorkerInfo
          workerName={workerInfo.name}
          accountId={workerInfo.accountId}
          linkPath="production"
        />
      )}

      {saveValidationError && (
        <div className="save-validation-error">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{saveValidationError}</span>
        </div>
      )}

      <ReleasePlanTable
        initialPlan={plan}
        onGetCurrentPlan={handleGetCurrentPlan}
        onValidationChange={handleValidationChange}
        showJsonView={showJsonView}
      />

      <hr className="plan-tabs-separator" />

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
            JSON View
          </label>
          <button
            onClick={handleSave}
            className="nice-button"
            disabled={hasValidationErrors}
          >
            Save
          </button>
        </div>
      </div>
      {plan.time_last_saved && (
        <div className="plan-tabs-time-saved">
          Last saved: {new Date(plan.time_last_saved).toLocaleString()}
        </div>
      )}
    </>
  );
};

interface PlanProps {
  onError?: (error: string) => void;
}

export const Plan: React.FC<PlanProps> = ({ onError }) => {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { workerInfo, isConnected, connectionId } = useWorkerConnection();

  // Fetch plan from API when connection changes
  useEffect(() => {
    const fetchPlan = async () => {
      // Clear any existing plan data when connection changes or no connection
      if (!isConnected || !connectionId) {
        setPlan({
          stages: [],
          slos: [],
          polling_fraction: 0.1,
          worker_name: "",
        });
        setError(null);
        setLoading(false);
        return;
      }

      // Fetch plan data if we have a connection
      try {
        setLoading(true);
        setError(null);

        const planData: Plan = await api.getPlan();
        setPlan(planData);
      } catch (err) {
        console.error("Error fetching plan:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch plan";
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [onError, isConnected, connectionId]);

  const handleSave = async (updatedPlan: Plan) => {
    try {
      setSaveSuccess(false); // Clear any previous success state

      // Use worker info from the hook
      const planWithWorkerDetails = {
        ...updatedPlan,
        worker_name: workerInfo?.name || "",
      };

      const data = await api.updatePlan(planWithWorkerDetails);
      setPlan(data);
      setSaveSuccess(true); // Show success message

      // Auto-hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving plan:", error);
      const errorMessage = `Failed to save plan: ${error instanceof Error ? error.message : "Unknown error"}`;
      alert(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    }
  };

  const handleRetry = () => {
    window.location.reload();
  };

  // Show empty state when no connection
  if (!isConnected) {
    return (
      <EmptyState
        title="No Worker Connection"
        description="Connect to a Cloudflare Worker to view and manage your release plan."
        icon="🔗"
      />
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-text">Loading release plan...</div>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-box">
          <h3 className="error-title">Error Loading Plan</h3>
          <p className="error-message">{error}</p>
        </div>
        <button onClick={handleRetry} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <EmptyState
        title="No Plan Found"
        description="No release plan was found for this worker."
        action={{
          label: "Refresh",
          onClick: handleRetry,
        }}
        icon="📋"
      />
    );
  }

  return (
    <PlanEditor plan={plan} onSave={handleSave} saveSuccess={saveSuccess} />
  );
};
