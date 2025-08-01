import React, { useState, useEffect, useRef } from "react";
import { Release } from "./Release";
import { History } from "./History";
import { Connect } from "./Connect";
import { api, getConnectionIdentifier } from "./utils";
import "./AppTabs.css";
import type { components } from "../../types/api";

type Release = components["schemas"]["Release"];

interface AppTabsProps {
  planEditor: React.ReactElement;
}

export const AppTabs: React.FC<AppTabsProps> = ({ planEditor }) => {
  const [activeTab, setActiveTab] = useState<
    "connect" | "plan" | "release" | "history"
  >("connect");
  const [hasActiveRelease, setHasActiveRelease] = useState<boolean>(false);
  const [activeReleaseState, setActiveReleaseState] = useState<string | null>(
    null,
  );
  const [isWorkerConnected, setIsWorkerConnected] = useState<boolean>(false);
  const hasActiveReleaseRef = useRef<boolean>(false);

  // Check for active release function
  const checkActiveRelease = async () => {
    const currentHasActive = hasActiveReleaseRef.current;
    try {
      const release = await api.getActiveRelease();

      if (release) {
        // Active release found
        hasActiveReleaseRef.current = true;
        setHasActiveRelease(true);
        setActiveReleaseState(release.state);
        // Don't automatically switch tabs - let user choose
      } else {
        // No active release found - check if we had one before (release finished)
        if (currentHasActive) {
          // Release just finished, auto-open History tab
          setActiveTab("history");
        }

        hasActiveReleaseRef.current = false;
        setHasActiveRelease(false);
        setActiveReleaseState(null);
      }
    } catch (error) {
      console.error("Error checking active release:", error);
      // Handle actual API errors (network issues, server errors, etc.)
      hasActiveReleaseRef.current = false;
      setHasActiveRelease(false);
      setActiveReleaseState(null);
    }
  };

  // Check for worker connection on component mount
  useEffect(() => {
    const connectionId = getConnectionIdentifier();

    if (connectionId) {
      setIsWorkerConnected(true);
      // Don't automatically switch tabs - let user choose
    } else {
      setIsWorkerConnected(false);
      // Ensure Connect tab is selected when no connection exists
      setActiveTab("connect");
    }
  }, []);

  // Check for active release on component mount and set up periodic polling
  useEffect(() => {
    // Initial check
    checkActiveRelease();

    // Set up periodic polling every 5 seconds
    const interval = setInterval(checkActiveRelease, 5000);

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleConnectionChange = (isConnected: boolean) => {
    setIsWorkerConnected(isConnected);
    if (!isConnected) {
      setActiveTab("connect"); // Switch back to connect tab after disconnecting
    }
    // Don't automatically switch to plan tab after connecting - let user choose
  };

  // Plan-related handlers have been moved to PlanEditor component

  const renderTabContent = () => {
    switch (activeTab) {
      case "connect":
        return <Connect onConnectionChange={handleConnectionChange} />;
      case "plan":
        return planEditor;
      case "release":
        return (
          <div className="tab-content">
            <Release
              onError={(error) => console.error("Release error:", error)}
              onReleaseStateChange={checkActiveRelease}
            />
          </div>
        );
      case "history":
        return (
          <div className="tab-content">
            <History
              onError={(error) => console.error("History error:", error)}
            />
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
            className={`tab-button ${activeTab === "connect" ? "active" : ""} ${activeReleaseState === "not_started" || activeReleaseState === "running" ? "disabled" : ""}`}
            onClick={() => setActiveTab("connect")}
            disabled={
              activeReleaseState === "not_started" ||
              activeReleaseState === "running"
            }
            title={
              activeReleaseState === "not_started" ||
              activeReleaseState === "running"
                ? "Cannot change connection while release is active"
                : ""
            }
          >
            Connect
          </button>
          <button
            className={`tab-button ${activeTab === "plan" ? "active" : ""} ${!isWorkerConnected ? "disabled" : ""}`}
            onClick={() => setActiveTab("plan")}
            disabled={!isWorkerConnected}
            title={!isWorkerConnected ? "Connect to a Worker first" : ""}
          >
            Plan
          </button>
          <button
            className={`tab-button ${activeTab === "release" ? "active" : ""} ${!isWorkerConnected ? "disabled" : ""}`}
            onClick={() => setActiveTab("release")}
            disabled={!isWorkerConnected}
            title={!isWorkerConnected ? "Connect to a Worker first" : ""}
          >
            <div className="plan-tabs-status-container">
              <span>Release</span>
              {hasActiveRelease &&
                ((activeReleaseState === "running" && (
                  <span
                    className={`tab-status-icon-running`}
                    title="Release started"
                  >
                    🟢
                  </span>
                )) || (
                  <span
                    className={`tab-status-icon-staged`}
                    title="Release staged"
                  >
                    🟡
                  </span>
                ))}
            </div>
          </button>
          <button
            className={`tab-button ${activeTab === "history" ? "active" : ""} ${!isWorkerConnected ? "disabled" : ""}`}
            onClick={() => setActiveTab("history")}
            disabled={!isWorkerConnected}
            title={!isWorkerConnected ? "Connect to a Worker first" : ""}
          >
            History
          </button>
        </div>

        <div className="tab-content-wrapper">{renderTabContent()}</div>
      </div>
    </div>
  );
};
