import React, { useState } from "react";

export const Instructions: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <button
        onClick={toggleExpanded}
        style={{
          width: "100%",
          padding: "0.75rem 1rem",
          border: "1px solid #e1e5e9",
          borderRadius: "6px",
          backgroundColor: "#f8f9fa",
          color: "#495057",
          fontSize: "0.95rem",
          fontWeight: "500",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#e9ecef";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#f8f9fa";
        }}
      >
        <span>📝 Instructions</span>
        <i
          className={`fas fa-chevron-${isExpanded ? "up" : "down"}`}
          style={{ fontSize: "0.8rem", transition: "transform 0.2s ease" }}
        ></i>
      </button>

      {isExpanded && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "1rem",
            border: "1px solid #e1e5e9",
            borderRadius: "6px",
            backgroundColor: "#ffffff",
            maxHeight: "300px",
            overflowY: "auto",
            fontSize: "0.9rem",
            lineHeight: "1.5",
            color: "#495057",
          }}
        >
          {/* Placeholder content - user will fill this in later */}
          <p style={{ margin: "0 0 1rem 0" }}>
            <strong>Welcome to Workers HMD!</strong>
          </p>
          <p style={{ margin: "0 0 1rem 0" }}>
            Read the docs on{" "}
            <a href="https://github.com/markjmiller/workers-hmd/blob/main/README.md">
              github
            </a>
            . You can deploy your own version of this:
            <br />
            <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/markjmiller/workers-hmd">
              <img
                src="https://deploy.workers.cloudflare.com/button"
                alt="Deploy to Cloudflare"
              />
            </a>
          </p>
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "#f8f9fa",
              borderRadius: "4px",
              marginBottom: "1rem",
            }}
          >
            <div>
              <ol style={{ margin: "0", paddingLeft: "1.2rem" }}>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong>Release Definition</strong>: define a release plan
                  with…
                  <ul style={{ marginTop: "0.25rem" }}>
                    <li>
                      <a
                        href="https://sre.google/sre-book/service-level-objectives/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Service Level Objectives
                      </a>{" "}
                      (SLOs) based on Service Level Indicators (SLIs) sourced
                      from Workers Observability
                    </li>
                    <li>
                      Customizable stages that define…
                      <ul>
                        <li>% rollout</li>
                        <li>Soak time</li>
                        <li>
                          Whether the stage progresses manually or automatically
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong>Version Creation</strong>: To initiate a production
                  release, create a new Worker version. By default, this has 0%
                  traffic routed to it.
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong>Release Start</strong>: Then start a release, which is
                  an instance of the release plan. Each stage in the plan
                  progressively increases the percentage of traffic directed
                  from the current Worker version to the new one. For example, a
                  release might consist of stages at 0%, 25%, 50%, 75%, and 100%
                  rollout.
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong>Staged Rollout with Soak Periods</strong>: Within each
                  stage, a soak period begins. During this time, the system
                  continuously monitors SLOs.
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong>Progression and Failing</strong>:
                  <ul style={{ marginTop: "0.25rem" }}>
                    <li>
                      If the soak period completes without any SLO violations,
                      the stage can either be manually or automatically
                      progressed to the next stage, increasing the traffic to
                      the new Worker version.
                    </li>
                    <li>
                      Crucially, if an SLO is violated at any point, the rollout
                      automatically aborts. The deployment is immediately
                      reverted to 100% of the old Worker version, and the new
                      version receives 0% of the traffic.
                    </li>
                  </ul>
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong>Completion</strong>: If all stages successfully pass
                  without SLO violations, the new Worker version reached 100%
                  deployment, meaning all production traffic is now routed to
                  it. At this point, the release is considered complete.
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
