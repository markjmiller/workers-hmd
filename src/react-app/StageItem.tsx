import React from "react";
import type { components } from "../../types/api";
import { formatStageState, formatTimeHMS, api } from "./utils";

type PlanStage = components["schemas"]["PlanStage"];
type ReleaseStage = components["schemas"]["ReleaseStage"];

interface StageItemProps {
  planStage: PlanStage;
  releaseStage?: ReleaseStage;
  showStatus?: boolean;
  showSoakTime?: boolean;
  releaseState?: string;
  onError?: (error: string) => void;
  disableActions?: boolean; // Disable approve/cancel buttons (e.g., for History tab)
}

export const StageItem: React.FC<StageItemProps> = ({
  planStage,
  releaseStage,
  showStatus = false,
  showSoakTime = false,
  releaseState,
  onError,
  disableActions = false,
}) => {
  const [isProgressing, setIsProgressing] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [logsExpanded, setLogsExpanded] = React.useState(false);

  const progressStage = async (stageId: string) => {
    try {
      setIsProgressing(true);
      await api.progressStage(stageId, "approve");
    } catch (error) {
      console.error("Error progressing stage:", error);
      if (onError) {
        onError(
          error instanceof Error ? error.message : "Failed to progress stage",
        );
      }
    } finally {
      setIsProgressing(false);
    }
  };

  const cancelStage = async (stageId: string) => {
    try {
      setIsCancelling(true);
      await api.progressStage(stageId, "deny");
      console.log(`Stage ${stageId} cancelled successfully`);
    } catch (error) {
      console.error("Error cancelling stage:", error);
      if (onError) {
        onError(
          error instanceof Error ? error.message : "Failed to cancel stage",
        );
      }
    } finally {
      setIsCancelling(false);
    }
  };
  return (
    <div className="release-stage-item">
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <div className="stage-info">
            <span className="stage-number">{planStage.order}</span>
            <span className="stage-target">{planStage.target_percent}%</span>
            {showSoakTime && (
              <span className="stage-soak">
                soak {formatTimeHMS(planStage.soak_time)}
              </span>
            )}
            <span className="stage-description">{planStage.description}</span>
          </div>
          {showStatus && releaseStage && (
            <div className="stage-status">
              {planStage.auto_progress && (
                <span
                  className="stage-auto-progress"
                  title="Auto progress enabled"
                >
                  Auto Progress
                </span>
              )}
              <span className={`stage-state ${releaseStage.state}`}>
                {formatStageState(releaseStage.state)}
              </span>
              {!planStage.auto_progress &&
                releaseStage.state === "awaiting_approval" &&
                releaseState !== "done_stopped_manually" &&
                !releaseState?.startsWith("done_") &&
                !disableActions && (
                  <div style={{ display: "flex", gap: "0.5em" }}>
                    <button
                      className="nice-button"
                      onClick={() => progressStage(releaseStage.id)}
                      disabled={isProgressing || isCancelling}
                      title="Approve and progress this stage"
                    >
                      {isProgressing ? "Progressing..." : "Approve"}
                    </button>
                    <button
                      className="nice-button"
                      style={{ backgroundColor: "#d32f2f" }}
                      onClick={() => cancelStage(releaseStage.id)}
                      disabled={isProgressing || isCancelling}
                      title="Cancel this stage"
                    >
                      {isCancelling ? "Cancelling..." : "Cancel"}
                    </button>
                  </div>
                )}
            </div>
          )}
          {planStage.auto_progress && !showStatus && (
            <span className="stage-auto-progress" title="Auto progress enabled">
              Auto Progress
            </span>
          )}
        </div>
        {showStatus && releaseStage && (
          <>
            <div className="stage-timing">
              {releaseStage.state === "running" &&
                releaseStage.time_elapsed !== undefined && (
                  <>
                    <span className="stage-time">
                      Elapsed: {formatTimeHMS(releaseStage.time_elapsed)}
                    </span>
                    <span
                      className="stage-time"
                      style={{
                        color: "#495057",
                        fontWeight: "600",
                      }}
                    >
                      Progress:{" "}
                      {Math.min(
                        100,
                        Math.round(
                          (releaseStage.time_elapsed / planStage.soak_time) *
                            100,
                        ),
                      )}
                      %
                    </span>
                  </>
                )}
              {releaseStage.state.startsWith("done_") &&
                releaseStage.time_done && (
                  <span className="stage-time">
                    Completed:{" "}
                    {new Date(releaseStage.time_done).toLocaleString()}
                  </span>
                )}
              {releaseStage.state.startsWith("done_") &&
                releaseStage.time_elapsed !== undefined && (
                  <span className="stage-time">
                    Total: {formatTimeHMS(releaseStage.time_elapsed)}
                  </span>
                )}
            </div>
            {releaseStage.logs && (
              <div className="stage-logs-section">
                <button
                  className="logs-toggle-button"
                  onClick={() => setLogsExpanded(!logsExpanded)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#666",
                    cursor: "pointer",
                    fontSize: "0.8em",
                    padding: "0.25em 0",
                  }}
                >
                  {logsExpanded ? "▼" : "▶"} Logs (
                  {
                    releaseStage.logs.split("\n").filter((line) => line.trim())
                      .length
                  }{" "}
                  entries)
                </button>
                {logsExpanded && (
                  <div
                    className="stage-logs"
                    style={{
                      maxHeight: "200px",
                      overflowY: "auto",
                      backgroundColor: "#f8f9fa",
                      border: "1px solid #e9ecef",
                      borderRadius: "0.25em",
                      padding: "0.5em",
                      marginTop: "0.25em",
                      fontFamily: "monospace",
                      fontSize: "0.75em",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {releaseStage.logs || "No logs available"}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
