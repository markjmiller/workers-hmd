import React, { useState, useEffect, useRef } from "react";
import type { components } from "../../types/api";
import { StageItem } from "./StageItem";
import { WorkerInfo } from "./WorkerInfo";
import {
  formatReleaseState,
  api,
  isReleaseComplete,
  getShortVersionId,
} from "./utils";
import { useWorkerConnection } from "./hooks/useWorkerConnection";
import { EmptyState } from "./components/EmptyState";
import "./Release.css";

type Release = components["schemas"]["Release"];
type ReleaseStage = components["schemas"]["ReleaseStage"];

interface ReleaseProps {
  onError?: (error: string) => void;
  onReleaseStateChange?: () => void;
  onTabChange?: () => void; // Called when user switches away from Release tab
}

export const Release: React.FC<ReleaseProps> = ({
  onError,
  onReleaseStateChange,
  onTabChange,
}) => {
  const [activeRelease, setActiveRelease] = useState<Release | null>(null);
  const [releaseStages, setReleaseStages] = useState<ReleaseStage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingStages, setLoadingStages] = useState(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);
  const [workerVersions, setWorkerVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState<boolean>(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [connectionVerified, setConnectionVerified] = useState<boolean>(false);
  const [, setActiveDeployment] = useState<any>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [selectedOldVersion, setSelectedOldVersion] = useState<string>("");
  const [selectedNewVersion, setSelectedNewVersion] = useState<string>("");

  // Use shared connection hook
  const { workerInfo, isConnected, connectionId } = useWorkerConnection();

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeReleaseRef = useRef<Release | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number | undefined>();

  // Check for active release on component mount and ensure polling starts
  useEffect(() => {
    const initializeRelease = async () => {
      // Check if worker connection exists before making API calls
      if (!isConnected || !connectionId) {
        // No connection exists - reset to default state and don't make API calls
        setLoading(false);
        setActiveRelease(null);
        setReleaseStages([]);
        setWorkerVersions([]);
        setConnectionVerified(false);
        return;
      }

      // Connection exists - proceed with initialization
      await checkActiveRelease();
      // If there's an active release after checking, ensure polling is running
      // This helps with cases where the component remounts after tab switching

      // Fetch worker versions and deployment info using worker info from hook
      if (workerInfo) {
        fetchWorkerVersions(workerInfo.name, workerInfo.accountId);
        fetchActiveDeployment(workerInfo.name, workerInfo.accountId);
      }
    };

    initializeRelease();
  }, [isConnected, connectionId]);

  // Keep activeReleaseRef in sync with activeRelease state
  useEffect(() => {
    activeReleaseRef.current = activeRelease;
  }, [activeRelease]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStagePolling();
      stopElapsedTimeTimer();
    };
  }, []);

  // Fetch worker versions
  const fetchWorkerVersions = async (workerName: string, accountId: string) => {
    setVersionsLoading(true);
    setVersionsError(null);
    setConnectionVerified(false);

    try {
      const apiToken = sessionStorage.getItem("apiToken");
      if (!apiToken) {
        throw new Error("API token not found in session storage");
      }

      // Call our internal API proxy instead of Cloudflare directly
      const response = await fetch("/api/worker/versions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          worker_name: workerName,
          account_id: accountId,
          api_token: apiToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.result) {
          let versions = data.result;

          // Ensure the currently deployed version is included in the list
          if (selectedOldVersion) {
            const deployedVersionExists = versions.some(
              (v: any) => v.id === selectedOldVersion,
            );
            if (!deployedVersionExists) {
              // Add deployed version placeholder if not in top 5
              const deployedVersionPlaceholder = {
                id: selectedOldVersion,
                number: 0,
                metadata: { created_on: new Date().toISOString() },
                annotations: {},
              };
              versions = [deployedVersionPlaceholder, ...versions.slice(0, 4)];
            }
          }

          setWorkerVersions(versions);
          setConnectionVerified(true);
        } else {
          throw new Error("No versions found");
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to connect to worker");
      }
    } catch (error) {
      console.error("Error fetching worker versions:", error);
      setVersionsError(
        error instanceof Error
          ? error.message
          : "Failed to connect to worker. Please check your worker name and account settings.",
      );
      setConnectionVerified(false);
    } finally {
      setVersionsLoading(false);
    }
  };

  // Fetch active deployment information
  const fetchActiveDeployment = async (
    workerName: string,
    accountId: string,
  ) => {
    try {
      const apiToken = sessionStorage.getItem("apiToken");
      if (!apiToken) {
        throw new Error("API token not found in session storage");
      }

      // Call our internal API proxy for deployments
      const response = await fetch("/api/worker/deployments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          worker_name: workerName,
          account_id: accountId,
          api_token: apiToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.success && data.result && data.result.length > 0) {
          const deploymentsData = data.result[0];

          if (
            deploymentsData.deployments &&
            deploymentsData.deployments.length > 0
          ) {
            const activeDeployment = deploymentsData.deployments[0];
            setActiveDeployment(activeDeployment);

            // Process deployment versions
            if (activeDeployment.versions) {
              if (
                activeDeployment.versions.length === 1 &&
                activeDeployment.versions[0].percentage === 100
              ) {
                // Single version at 100% - this is the active version
                setSelectedOldVersion(activeDeployment.versions[0].version_id);
              } else if (activeDeployment.versions.length > 1) {
                // Multiple versions - split deployment
                const versionSummary = activeDeployment.versions
                  .map(
                    (v: any) =>
                      `${v.version_id.substring(0, 8)} (${v.percentage}%)`,
                  )
                  .join(" and ");
                setDeploymentError(
                  `There's already an active split deployment between ${versionSummary}`,
                );
              }
            }
          } else {
            setDeploymentError("No deployments found in response");
          }
        } else {
          setDeploymentError("No active deployment found");
        }
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching deployment information:", error);
      setDeploymentError(
        error instanceof Error
          ? error.message
          : "Failed to fetch deployment information",
      );
    }
  };

  // Create release handler
  const handleCreateRelease = async () => {
    try {
      setCreating(true);
      // Create release with selected version UUIDs directly
      const releaseData = {
        old_version: selectedOldVersion,
        new_version: selectedNewVersion,
      };
      const newRelease = await api.createRelease(releaseData);
      setActiveRelease(newRelease);
      // Clear the selected versions after successful creation
      setSelectedOldVersion("");
      setSelectedNewVersion("");
      // Fetch stages for the new release
      await fetchStagesForRelease(newRelease);
      if (onReleaseStateChange) {
        onReleaseStateChange();
      }
      // Force refresh to check for new active release
      await checkActiveRelease();
    } catch (error) {
      console.error("Error creating release:", error);
      if (onError) {
        onError(
          error instanceof Error ? error.message : "Failed to create release",
        );
      }
    } finally {
      setCreating(false);
    }
  };

  // Start polling for stage updates
  const startStagePolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const interval = setInterval(async () => {
      // Use ref to get current activeRelease state - fixes closure issue after tab switching
      const currentActiveRelease = activeReleaseRef.current;
      if (!currentActiveRelease || !currentActiveRelease.stages) {
        return;
      }

      try {
        // First, poll the active release to get updated release state
        try {
          const updatedRelease = await api.getActiveRelease();
          setActiveRelease(updatedRelease);

          // Start/stop elapsed time timer based on release state
          if (updatedRelease.state === "running") {
            startElapsedTimeTimer(updatedRelease);
          } else {
            stopElapsedTimeTimer();
          }

          // If release state changed to a done state, redirect to history tab
          if (isReleaseComplete(updatedRelease.state)) {
            stopStagePolling();
            if (onTabChange) {
              onTabChange(); // Switch to history tab
            }
            return;
          }
        } catch (error) {
          // Release no longer exists (404) - clear it and stop polling
          setActiveRelease(null);
          setReleaseStages([]);
          stopStagePolling();
          return;
        }

        // Poll each stage for updates - use current release from ref
        const stagePromises = currentActiveRelease.stages.map(
          async (stageRef) => {
            if (!stageRef.id) return null;

            try {
              return (await api.getStage(stageRef.id)) as ReleaseStage;
            } catch (error) {
              console.warn(`Error polling stage ${stageRef.id}:`, error);
              return null;
            }
          },
        );

        const stages = await Promise.all(stagePromises);
        const validStages = stages.filter(
          (stage): stage is ReleaseStage => stage !== null,
        );

        // Sort stages by order and update state
        validStages.sort((a, b) => a.order - b.order);
        setReleaseStages(validStages);
      } catch (error) {
        console.error("Error polling stages and release:", error);
      }
    }, 1000); // Poll every 1 second

    pollingIntervalRef.current = interval;
  };

  // Stop polling for stage updates
  const stopStagePolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Start elapsed time timer for dynamic updates
  const startElapsedTimeTimer = (release: Release) => {
    stopElapsedTimeTimer();

    if (!release.time_started) return;

    const startTime = new Date(release.time_started).getTime();

    const updateElapsedTime = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedTime(elapsed);
    };

    updateElapsedTime(); // Initial update
    elapsedTimeIntervalRef.current = setInterval(updateElapsedTime, 1000);
  };

  // Stop elapsed time timer
  const stopElapsedTimeTimer = () => {
    if (elapsedTimeIntervalRef.current) {
      clearInterval(elapsedTimeIntervalRef.current);
      elapsedTimeIntervalRef.current = null;
    }
    setElapsedTime(undefined);
  };

  const fetchStagesForRelease = async (release: Release) => {
    // Stop any existing polling
    stopStagePolling();

    if (!release.stages || release.stages.length === 0) {
      setReleaseStages([]);
      return;
    }

    try {
      setLoadingStages(true);
      const stagePromises = release.stages.map(async (stageRef) => {
        if (!stageRef.id) return null;

        try {
          return (await api.getStage(stageRef.id)) as ReleaseStage;
        } catch (error) {
          console.warn(`Error fetching stage ${stageRef.id}:`, error);
          return null;
        }
      });

      const stages = await Promise.all(stagePromises);
      const validStages = stages.filter(
        (stage): stage is ReleaseStage => stage !== null,
      );

      // Sort stages by order
      validStages.sort((a, b) => a.order - b.order);
      setReleaseStages(validStages);

      // Start polling for real-time updates
      startStagePolling();
    } catch (error) {
      console.error("Error fetching stages:", error);
      if (onError) {
        onError(
          error instanceof Error ? error.message : "Failed to fetch stages",
        );
      }
    } finally {
      setLoadingStages(false);
    }
  };

  const checkActiveRelease = async () => {
    try {
      setLoading(true);
      const release = await api.getActiveRelease();

      if (release) {
        // Active release found
        setActiveRelease(release);

        // Start elapsed time timer if release is running
        if (release.state === "running") {
          startElapsedTimeTimer(release);
        }

        // Fetch stages for the active release
        await fetchStagesForRelease(release);

        // Ensure polling is started - this is critical for tab switching
        // We start polling after setting state to avoid race conditions
        setTimeout(() => {
          if (release.stages && release.stages.length > 0) {
            startStagePolling();
          }
        }, 100);
      } else {
        // No active release found
        setActiveRelease(null);
        setReleaseStages([]);
        stopStagePolling();
      }
    } catch (error) {
      // Handle actual API errors (network issues, server errors, etc.)
      setActiveRelease(null);
      setReleaseStages([]);
      stopStagePolling();

      console.error("Error checking active release:", error);
      if (onError) {
        onError(
          error instanceof Error
            ? error.message
            : "Failed to check active release",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteRelease = async () => {
    if (!activeRelease) return;

    try {
      setDeleting(true);
      await api.deleteActiveRelease();
      setActiveRelease(null);
      setReleaseStages([]);
      // Stop polling when release is deleted
      stopStagePolling();
      if (onReleaseStateChange) {
        onReleaseStateChange();
      }
    } catch (error) {
      console.error("Error deleting release:", error);
      if (onError) {
        onError(
          error instanceof Error ? error.message : "Failed to delete release",
        );
      }
    } finally {
      setDeleting(false);
    }
  };

  const startRelease = async () => {
    if (!activeRelease) return;

    try {
      setStarting(true);
      await api.startRelease();
      // Release started successfully
      // Refresh the release data to get updated state
      await checkActiveRelease();
      // Notify parent component that release state has changed
      if (onReleaseStateChange) {
        onReleaseStateChange();
      }
    } catch (error) {
      console.error("Error starting release:", error);
      if (onError) {
        onError(
          error instanceof Error ? error.message : "Failed to start release",
        );
      }
    } finally {
      setStarting(false);
    }
  };

  const stopRelease = async () => {
    if (!activeRelease) return;

    try {
      setStopping(true);
      await api.stopRelease();
      // Release stopped successfully
      // Refresh the release data to get updated state
      await checkActiveRelease();
      // Notify parent component that release state has changed
      if (onReleaseStateChange) {
        onReleaseStateChange();
      }
    } catch (error) {
      console.error("Error stopping release:", error);
      if (onError) {
        onError(
          error instanceof Error ? error.message : "Failed to stop release",
        );
      }
    } finally {
      setStopping(false);
    }
  };

  // Show empty state when no connection
  if (!isConnected) {
    return (
      <EmptyState
        title="No Worker Connection"
        description="Connect to a Cloudflare Worker to view and manage releases."
        icon="🚀"
      />
    );
  }

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

          {workerInfo && (
            <>
              <WorkerInfo
                workerName={workerInfo.name}
                accountId={workerInfo.accountId}
                linkPath="deployments"
                className="card-info"
                style={{}}
              />

              {/* Worker Connection Status */}
              {versionsLoading ? (
                <div
                  style={{
                    marginBottom: "1rem",
                    padding: "1rem",
                    border: "1px solid #e0e0e0",
                    borderRadius: "4px",
                    backgroundColor: "#f9f9f9",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <div
                      className="loading-spinner"
                      style={{ width: "16px", height: "16px" }}
                    ></div>
                    <span>Loading versions...</span>
                  </div>
                </div>
              ) : versionsError ? (
                <div
                  style={{
                    marginBottom: "1rem",
                    padding: "1rem",
                    border: "1px solid #ffcccc",
                    borderRadius: "4px",
                    backgroundColor: "#fff5f5",
                  }}
                >
                  <h4
                    style={{
                      margin: "0 0 0.5rem 0",
                      color: "#d32f2f",
                      fontSize: "1rem",
                    }}
                  >
                    Could not connect to worker
                  </h4>
                  <p style={{ margin: "0", fontSize: "0.9rem", color: "#666" }}>
                    {versionsError}
                  </p>
                  <button
                    onClick={() =>
                      fetchWorkerVersions(workerInfo.name, workerInfo.accountId)
                    }
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.25rem 0.75rem",
                      fontSize: "0.8rem",
                      border: "1px solid #d32f2f",
                      backgroundColor: "transparent",
                      color: "#d32f2f",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Retry Connection
                  </button>
                </div>
              ) : null}
            </>
          )}

          {/* Deployment Status */}
          {deploymentError ? (
            <div
              style={{
                marginBottom: "1rem",
                padding: "1rem",
                border: "1px solid #ffcccc",
                borderRadius: "4px",
                backgroundColor: "#fff5f5",
              }}
            >
              <h4
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "#d32f2f",
                  fontSize: "1rem",
                }}
              >
                ⚠️ Cannot create release
              </h4>
              <p style={{ margin: "0", fontSize: "0.9rem", color: "#666" }}>
                {deploymentError}
              </p>
              <p
                style={{
                  margin: "0.5rem 0 0 0",
                  fontSize: "0.8rem",
                  color: "#666",
                }}
              >
                Please resolve the split deployment before creating a new
                release.
              </p>
            </div>
          ) : connectionVerified && workerVersions.length > 0 ? (
            <div style={{ marginBottom: "1rem" }}>
              {/* Version Selection */}
              <div style={{ marginBottom: "1rem" }}>
                <h4 style={{ margin: "0 0 1rem 0", fontSize: "1rem" }}>
                  Select version to deploy
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {workerVersions.map((version) => {
                    const isSelected = selectedNewVersion === version.id;
                    const isActive = selectedOldVersion === version.id; // Currently deployed version
                    const isLatest = workerVersions[0]?.id === version.id; // Most recently uploaded
                    const isDisabled = isActive || creating;

                    return (
                      <button
                        key={version.id}
                        onClick={() =>
                          !isDisabled && setSelectedNewVersion(version.id)
                        }
                        disabled={isDisabled}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem",
                          border: isSelected
                            ? "2px solid #2196f3"
                            : isActive
                              ? "1px solid #4caf50"
                              : "1px solid #e0e0e0",
                          borderRadius: "4px",
                          backgroundColor: isSelected
                            ? "#e3f2fd"
                            : isActive
                              ? "#e8f5e8"
                              : "#f9f9f9",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          opacity: isDisabled ? 0.7 : 1,
                          textAlign: "left",
                        }}
                        title={
                          isActive
                            ? "Currently deployed version - cannot select"
                            : "Click to select this version"
                        }
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              marginBottom: "0.5rem",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "monospace",
                                fontSize: "0.85rem",
                                wordBreak: "break-all",
                                color: "#333",
                              }}
                            >
                              {getShortVersionId(version.id)}
                            </span>
                            {isActive && (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "white",
                                  backgroundColor: "#4caf50",
                                  padding: "0.15rem 0.4rem",
                                  borderRadius: "12px",
                                  fontWeight: "600",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                }}
                              >
                                Active
                              </span>
                            )}
                            {isLatest && !isActive && (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  color: "white",
                                  backgroundColor: "#ffb74a",
                                  padding: "0.15rem 0.4rem",
                                  borderRadius: "12px",
                                  fontWeight: "600",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                }}
                              >
                                Latest
                              </span>
                            )}
                          </div>

                          {/* Version Message */}
                          {version.annotations &&
                            version.annotations["workers/message"] && (
                              <div
                                style={{
                                  fontSize: "0.8rem",
                                  color: "#444",
                                  marginTop: "0.25rem",
                                  fontStyle: "italic",
                                  backgroundColor: "rgb(223, 223, 223)",
                                  padding: "0.25rem",
                                  borderRadius: "4px",
                                }}
                              >
                                "{version.annotations["workers/message"]}"
                              </div>
                            )}

                          {/* Date */}
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#666",
                              marginTop: "0.5rem",
                            }}
                          >
                            {version.metadata?.created_on
                              ? new Date(
                                  version.metadata.created_on,
                                ).toLocaleString()
                              : "No date available"}
                          </div>
                        </div>
                        {isSelected && (
                          <div
                            style={{
                              marginLeft: "1rem",
                              color: "#2196f3",
                              fontWeight: "bold",
                              fontSize: "1.2rem",
                            }}
                          >
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <button
            className="nice-button create-release-button"
            onClick={handleCreateRelease}
            disabled={
              creating ||
              !selectedOldVersion ||
              !selectedNewVersion ||
              !!deploymentError
            }
          >
            {creating ? "Creating Release..." : "Create Release"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="release-active">
      <div className="release-header">
        <div className="release-info">
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "0.5em",
              alignItems: "baseline",
            }}
          >
            <span className={`release-state ${activeRelease.state}`}>
              {formatReleaseState(activeRelease.state)}
            </span>
            <span className="release-id">ID: {activeRelease.id}</span>
          </div>
          {/* Worker and Version Information */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.1em",
              fontSize: "0.9em",
              color: "#666",
              backgroundColor: "#f8f9fa",
              padding: "0.75em",
              borderRadius: "4px",
            }}
          >
            {workerInfo && (
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.5rem",
                }}
              >
                <a
                  href={`https://dash.cloudflare.com/${workerInfo.accountId}/workers/services/view/${workerInfo.name}/production/deployments`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#666", textDecoration: "none" }}
                  title="Open in Cloudflare Dashboard"
                >
                  <span style={{ fontSize: "0.95rem", color: "#495057" }}>
                    <strong>Worker:</strong>
                    <span
                      className="text-mono"
                      style={{ marginLeft: "0.5rem", color: "#007bff" }}
                    >
                      {workerInfo.name}{" "}
                      <i
                        className="fas fa-external-link-alt"
                        style={{ fontSize: "0.8rem" }}
                      ></i>
                    </span>
                  </span>
                </a>
              </div>
            )}
            {activeRelease.old_version && (
              <span style={{ fontSize: "0.875em" }}>
                <strong>Current version:</strong>{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {getShortVersionId(activeRelease.old_version)}
                </span>
              </span>
            )}
            {activeRelease.new_version && (
              <span style={{ fontSize: "0.875em" }}>
                <strong>New version:</strong>{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {getShortVersionId(activeRelease.new_version)}
                </span>
              </span>
            )}
          </div>
          <div className="release-timestamp">
            {activeRelease.state === "not_started" &&
              activeRelease.time_created && (
                <span className="timestamp-info">
                  Created:{" "}
                  {new Date(activeRelease.time_created).toLocaleString()}
                </span>
              )}
            {activeRelease.state === "running" && (
              <div
                className="running-timestamps"
                style={{ marginLeft: "0.5em" }}
              >
                {activeRelease.time_started && (
                  <span className="timestamp-info">
                    Started:{" "}
                    {new Date(activeRelease.time_started).toLocaleString()}
                  </span>
                )}
                {(elapsedTime !== undefined ||
                  activeRelease.time_elapsed !== undefined) && (
                  <span className="timestamp-info">
                    Elapsed:{" "}
                    {(() => {
                      const elapsed =
                        elapsedTime !== undefined
                          ? elapsedTime
                          : activeRelease.time_elapsed!;
                      return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
                    })()}
                  </span>
                )}
              </div>
            )}
            {activeRelease.state.startsWith("done_") && (
              <div className="done-timestamps">
                {activeRelease.time_started && (
                  <span className="timestamp-info">
                    Started:{" "}
                    {new Date(activeRelease.time_started).toLocaleString()}
                  </span>
                )}
                {activeRelease.time_done && (
                  <span className="timestamp-info">
                    Completed:{" "}
                    {new Date(activeRelease.time_done).toLocaleString()}
                  </span>
                )}
                {activeRelease.time_elapsed !== undefined && (
                  <span className="timestamp-info">
                    Total time: {Math.floor(activeRelease.time_elapsed / 60)}m{" "}
                    {activeRelease.time_elapsed % 60}s
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {activeRelease.state === "not_started" && (
          <div style={{ display: "flex", gap: "0.5em" }}>
            <button
              className="nice-button start-release-button"
              onClick={startRelease}
              disabled={starting}
            >
              {starting ? "Starting..." : "Start"}
            </button>
            <button
              className="nice-button delete-release-button"
              onClick={deleteRelease}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        )}
        {activeRelease.state === "running" && (
          <div style={{ display: "flex", gap: "0.5em" }}>
            <button
              className="nice-button stop-release-button"
              onClick={stopRelease}
              disabled={stopping}
            >
              {stopping ? "Stopping..." : "Stop"}
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
                <span className="slo-value">
                  {slo.percentile} latency &lt; {slo.latency_ms}ms
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="release-stages">
          <h4>Stages</h4>
          {loadingStages ? (
            <div>Loading stages...</div>
          ) : (
            <div className="stages-list">
              {activeRelease.plan_record.stages.map((planStage) => {
                const releaseStage = releaseStages.find(
                  (s) => s.order === planStage.order,
                );
                return (
                  <StageItem
                    key={planStage.order}
                    planStage={planStage}
                    releaseStage={releaseStage}
                    showStatus={true}
                    showSoakTime={true}
                    releaseState={activeRelease.state}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
