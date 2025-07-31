import React from "react";

interface WorkerInfoProps {
  workerName: string;
  accountId: string;
  linkPath?: "production" | "deployments"; // Default to 'production', 'deployments' for release pages
  className?: string;
  style?: React.CSSProperties;
}

export const WorkerInfo: React.FC<WorkerInfoProps> = ({
  workerName,
  accountId,
  linkPath = "production",
  className = "card-info",
  style = { marginBottom: "1.5rem" },
}) => {
  const baseUrl = `https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}/production`;
  const fullUrl =
    linkPath === "deployments" ? `${baseUrl}/deployments` : baseUrl;

  return (
    <div className={className} style={style}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
        <i className="fas fa-cog icon-secondary"></i>
        <a
          href={fullUrl}
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
              {workerName}{" "}
              <i
                className="fas fa-external-link-alt"
                style={{ fontSize: "0.8rem" }}
              ></i>
            </span>
          </span>
        </a>
      </div>
    </div>
  );
};
