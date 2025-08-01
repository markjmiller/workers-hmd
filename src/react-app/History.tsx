import React, { useState, useEffect } from "react";
import type { components } from "../../types/api";
import { StageItem } from "./StageItem";
import {
  formatReleaseState,
  getStateColor,
  api,
  isReleaseComplete,
  getShortVersionId,
} from "./utils";
import { useWorkerConnection } from "./hooks/useWorkerConnection";
import { EmptyState } from "./components/EmptyState";
import "./History.css";

type Release = components["schemas"]["Release"];

interface HistoryProps {
  onError?: (error: string) => void;
}

type ReleaseStage = components["schemas"]["ReleaseStage"];

export const History: React.FC<HistoryProps> = ({ onError }) => {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [_, setHasMoreResults] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(
    new Set(),
  );
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [releaseStages, setReleaseStages] = useState<
    Record<string, ReleaseStage[]>
  >({});

  // Use shared connection hook
  const { isConnected, connectionId } = useWorkerConnection();

  useEffect(() => {
    // Check if worker connection exists before making API calls
    if (!isConnected || !connectionId) {
      // No connection exists - reset to default state and don't make API calls
      setLoading(false);
      setReleases([]);
      setCurrentPage(0);
      setHasMoreResults(false);
      setReleaseStages({});
      return;
    }

    // Connection exists - proceed with fetching release history
    fetchReleaseHistory(true);
  }, [isConnected, connectionId]);

  const fetchReleaseHistory = async (
    resetPage = false,
    pageNum?: number,
    overrideFromDate?: string,
    overrideToDate?: string,
  ) => {
    try {
      const targetPage = resetPage
        ? 0
        : pageNum !== undefined
          ? pageNum
          : currentPage;
      const isInitialLoad = resetPage || targetPage === 0;
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const offset = resetPage ? 0 : targetPage * 5;
      const queryParams = new URLSearchParams({
        limit: "6", // Fetch 6 to check if there are more results
        offset: offset.toString(),
        // Only show completed releases by filtering out active states
        // Note: We'll filter these on the client side since the API doesn't support NOT operators
      });

      // Add date range parameters if specified (use override values if provided)
      const effectiveFromDate =
        overrideFromDate !== undefined ? overrideFromDate : fromDate;
      const effectiveToDate =
        overrideToDate !== undefined ? overrideToDate : toDate;

      if (effectiveFromDate) {
        queryParams.set("since", new Date(effectiveFromDate).toISOString());
      }
      if (effectiveToDate) {
        // Set end of day for 'until' parameter
        const endOfDay = new Date(effectiveToDate);
        endOfDay.setHours(23, 59, 59, 999);
        queryParams.set("until", endOfDay.toISOString());
      }

      const releaseHistory = await api.getReleaseHistory(
        Object.fromEntries(queryParams),
      );
      // Filter out active releases to show only completed releases
      const completedReleases = releaseHistory.filter((release: Release) =>
        isReleaseComplete(release.state),
      );

      // Check if there are more results (we fetched 6, so if we have 6+ completed releases, there are more)
      const hasMore = completedReleases.length > 5;
      const displayReleases = completedReleases.slice(0, 5);

      if (resetPage) {
        setReleases(displayReleases);
        setCurrentPage(0);
        // Expand first release by default
        if (displayReleases.length > 0) {
          setExpandedReleases(new Set([displayReleases[0].id]));
        }
        // Fetch stage data for all releases
        fetchStageDataForReleases(displayReleases);
      } else {
        setReleases((prev) => [...prev, ...displayReleases]);
        if (pageNum !== undefined) {
          setCurrentPage(pageNum);
        }
        // Fetch stage data for new releases
        fetchStageDataForReleases(displayReleases);
      }

      setHasMoreResults(hasMore);
    } catch (error) {
      console.error("Error fetching release history:", error);
      if (onError) {
        onError(
          error instanceof Error
            ? error.message
            : "Failed to fetch release history",
        );
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchStageDataForReleases = async (releasesToFetch: Release[]) => {
    const stageDataPromises = releasesToFetch.map(async (release) => {
      if (!release.stages || release.stages.length === 0) {
        return { releaseId: release.id, stages: [] };
      }

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

      return { releaseId: release.id, stages: validStages };
    });

    try {
      const stageDataResults = await Promise.all(stageDataPromises);
      const stageDataMap = stageDataResults.reduce(
        (acc, { releaseId, stages }) => {
          acc[releaseId] = stages;
          return acc;
        },
        {} as Record<string, ReleaseStage[]>,
      );

      setReleaseStages((prev) => ({ ...prev, ...stageDataMap }));
    } catch (error) {
      console.error("Error fetching stage data:", error);
    }
  };

  const toggleReleaseExpanded = (releaseId: string) => {
    setExpandedReleases((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(releaseId)) {
        newSet.delete(releaseId);
      } else {
        newSet.add(releaseId);
      }
      return newSet;
    });
  };

  const handleSearch = () => {
    fetchReleaseHistory(true);
  };

  const handleClearSearch = () => {
    setFromDate("");
    setToDate("");
    // Pass empty strings directly to avoid async state update issues
    fetchReleaseHistory(true, undefined, "", "");
  };

  const loadMore = async () => {
    //if (!hasMoreResults || loadingMore) return;

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

  // Show empty state when no connection
  if (!isConnected) {
    return (
      <EmptyState
        title="No Worker Connection"
        description="Connect to a Cloudflare Worker to view release history."
        icon="📊"
      />
    );
  }

  return (
    <div className="history-container">
      {/* Date Range Search - Always visible */}
      <div className="date-search-container">
        <div className="date-search-inputs">
          <div className="date-input-group">
            <label htmlFor="from-date">From:</label>
            <input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="date-input"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="to-date">To:</label>
            <input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="date-input"
            />
          </div>
        </div>
        <div className="date-search-buttons">
          <button onClick={handleSearch} className="nice-button search-btn">
            Search
          </button>
          <button onClick={handleClearSearch} className="nice-button clear-btn">
            Clear
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="history-loading">
          <div className="loading-spinner"></div>
          <p>Loading release history...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && releases.length === 0 && (
        <div className="history-empty">
          <p>
            No completed releases found
            {fromDate || toDate ? " for the selected date range" : ""}.
          </p>
        </div>
      )}

      {/* Release List */}
      {!loading && releases.length > 0 && (
        <>
          <div className="history-list">
            {releases.map((release) => {
              const isExpanded = expandedReleases.has(release.id);
              return (
                <div key={release.id} className="history-item">
                  <div
                    className="history-header"
                    onClick={() => toggleReleaseExpanded(release.id)}
                  >
                    <div className="history-info">
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          gap: "0.5em",
                          alignItems: "baseline",
                        }}
                      >
                        <span
                          className="history-state"
                          style={{
                            backgroundColor: getStateColor(release.state),
                          }}
                        >
                          {formatReleaseState(release.state)}
                        </span>
                        <span className="history-id">ID: {release.id}</span>
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
                        {release.plan_record?.worker_name && (
                          <span>
                            <strong>Worker:</strong>{" "}
                            {release.plan_record.worker_name}
                          </span>
                        )}
                        {release.old_version && (
                          <span>
                            <strong>Old version:</strong>{" "}
                            <span style={{ fontFamily: "monospace" }}>
                              {getShortVersionId(release.old_version)}
                            </span>
                          </span>
                        )}
                        {release.new_version && (
                          <span>
                            <strong>New version:</strong>{" "}
                            <span style={{ fontFamily: "monospace" }}>
                              {getShortVersionId(release.new_version)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="history-header-right">
                      <div className="history-timestamps">
                        {release.time_started && (
                          <span className="history-timestamp">
                            Started:{" "}
                            {new Date(release.time_started).toLocaleString()}
                          </span>
                        )}
                        {release.time_done && (
                          <span className="history-timestamp">
                            Completed:{" "}
                            {new Date(release.time_done).toLocaleString()}
                          </span>
                        )}
                        {release.time_elapsed !== undefined && (
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5em",
                              alignItems: "baseline",
                              marginTop: "0.5em",
                            }}
                          >
                            <span className="stat-label">Duration:</span>
                            <span className="stat-value">
                              {formatDuration(release.time_elapsed)}
                            </span>
                          </div>
                        )}
                      </div>
                      <button className="expand-toggle-btn">
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="history-details">
                      <div className="history-slos">
                        <h4>SLOs</h4>
                        <div className="slos-grid">
                          {release.plan_record.slos.map((slo, index) => (
                            <div key={index} className="slo-item">
                              {slo.percentile} latency &lt; {slo.latency_ms}ms
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="history-stages">
                        <h4>Stages</h4>
                        <div className="stages-grid">
                          {release.plan_record.stages.map((planStage) => {
                            const executedStage = releaseStages[
                              release.id
                            ]?.find((stage) => stage.order === planStage.order);
                            return (
                              <StageItem
                                key={planStage.order}
                                planStage={planStage}
                                releaseStage={executedStage}
                                showStatus={true}
                                showSoakTime={true}
                                disableActions={true}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <div className="pagination-controls">
            {loadingMore ? (
              <div className="loading-more">
                <span>Loading more...</span>
              </div>
            ) : (
              <button onClick={loadMore} className="nice-button">
                Load More
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
