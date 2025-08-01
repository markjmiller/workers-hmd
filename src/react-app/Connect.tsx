import React, { useState, useEffect } from "react";
import "./common.css";
import { WorkerInfo } from "./WorkerInfo";
import { hashApiToken } from "./utils";

interface ConnectProps {
  onConnectionChange: (isConnected: boolean) => void;
}

interface WorkerConnection {
  apiToken: string;
  accountId: string;
  workerName: string;
}

export const Connect: React.FC<ConnectProps> = ({ onConnectionChange }) => {
  const [formData, setFormData] = useState<WorkerConnection>({
    apiToken: "",
    accountId: "",
    workerName: "",
  });

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Check if already connected on component mount
  useEffect(() => {
    const savedConnection = sessionStorage.getItem("workerConnection");
    if (savedConnection) {
      try {
        const connection = JSON.parse(savedConnection);
        setFormData(connection);
        setIsConnected(true);
        onConnectionChange(true);
      } catch (error) {
        console.error("Error parsing saved connection:", error);
      }
    }
  }, [onConnectionChange]);

  const handleInputChange = (field: keyof WorkerConnection, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.apiToken || !formData.accountId || !formData.workerName) {
      alert("Please fill in all fields");
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      // Test the connection by calling our internal API proxy
      const response = await fetch("/api/worker/versions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          worker_name: formData.workerName,
          account_id: formData.accountId,
          api_token: formData.apiToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.result) {
          // Connection successful - store in session storage with hashed token for security
          const hashedToken = await hashApiToken(formData.apiToken);

          const connectionData = {
            accountId: formData.accountId,
            workerName: formData.workerName,
            hashedApiToken: hashedToken,
          };

          sessionStorage.setItem(
            "workerConnection",
            JSON.stringify(connectionData),
          );
          sessionStorage.setItem("apiToken", formData.apiToken); // Keep raw token separate for API calls
          setIsConnected(true);
          onConnectionChange(true);
        } else {
          throw new Error(
            "No worker versions found. Please check your worker name.",
          );
        }
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Connection failed");
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      let errorMessage = "Failed to connect to worker.";

      if (error instanceof Error) {
        // The server-side proxy already provides user-friendly error messages
        errorMessage = error.message;
      }

      setConnectionError(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem("workerConnection");
    sessionStorage.removeItem("apiToken");
    setFormData({
      apiToken: "",
      accountId: "",
      workerName: "",
    });
    setIsConnected(false);
    setConnectionError(null);
    onConnectionChange(false);
  };

  if (isConnected) {
    return (
      <div className="tab-content">
        <div style={{ padding: "1rem" }}>
          {/* Connected Status Card */}
          <div className="card-connected">
            {/* Status Header */}
            <div className="status-header">
              <div className="status-icon">✓</div>
              <h3 className="status-title" style={{ margin: "0" }}>
                Connected to Worker
              </h3>
            </div>

            {/* Worker Details */}
            <div className="status-details">
              <WorkerInfo
                workerName={formData.workerName}
                accountId={formData.accountId}
                linkPath="production"
                className="status-detail-item"
                style={{}}
              />

              <div className="status-detail-item">
                <i className="fas fa-id-card icon-secondary"></i>
                <span className="status-detail-text">
                  <strong>Account:</strong>
                  <span className="status-detail-value status-detail-value-secondary text-mono">
                    {formData.accountId}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="button-group">
            <button
              type="button"
              className="nice-button"
              onClick={handleDisconnect}
              style={{
                backgroundColor: "#dc3545",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <i className="fas fa-unlink"></i>
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content">
      <div className="form-container">
        {/* Connect Form Card */}
        <div className="card-large">
          {/* Form Header */}
          <div className="form-header">
            <h3 className="form-title" style={{ margin: "0" }}>
              <i className="fas fa-plug icon-primary"></i>
              Connect to Cloudflare Worker
            </h3>
          </div>

          <form onSubmit={handleConnect}>
            {/* API Token Field */}
            <div className="form-field">
              <label htmlFor="apiToken" className="form-label">
                <i className="fas fa-key icon-secondary"></i>
                API Token *
              </label>

              {/* Help Text */}
              <div className="help-text-warning">
                <div className="margin-bottom-small">
                  <i className="fas fa-exclamation-triangle"></i>{" "}
                  <a
                    href="https://developers.cloudflare.com/fundamentals/api/get-started/create-token/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="help-link"
                  >
                    How to create a token{" "}
                    <i
                      className="fas fa-external-link-alt"
                      style={{ marginRight: "0.5rem" }}
                    ></i>
                  </a>
                </div>
                <div className="help-warning-content">
                  <span>
                    Don't share your API token anywhere you don't trust! Not
                    even here. You can deploy your own version of this demo that
                    you can trust:
                  </span>
                  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/markjmiller/workers-hmd">
                    <img
                      src="https://deploy.workers.cloudflare.com/button"
                      alt="Deploy to Cloudflare"
                    />
                  </a>
                </div>
              </div>

              <input
                type="password"
                id="apiToken"
                value={formData.apiToken}
                onChange={(e) => handleInputChange("apiToken", e.target.value)}
                placeholder="Enter your Cloudflare API Token"
                className="form-input form-input-mono form-input-text"
                required
              />
            </div>

            {/* Account ID Field */}
            <div className="form-field">
              <label htmlFor="accountId" className="form-label">
                <i className="fas fa-id-card icon-secondary"></i>
                Account ID *
              </label>

              {/* Help Text */}
              <div className="help-text-info">
                <a
                  href="https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="help-link"
                >
                  <i
                    className="fas fa-external-link-alt"
                    style={{ marginRight: "0.5rem" }}
                  ></i>
                  Find your account ID
                </a>
              </div>

              <input
                type="text"
                id="accountId"
                value={formData.accountId}
                onChange={(e) => handleInputChange("accountId", e.target.value)}
                placeholder="Enter your Cloudflare Account ID"
                className="form-input form-input-mono form-input-text"
                required
              />
            </div>

            {/* Worker Name Field */}
            <div className="form-field-large">
              <label htmlFor="workerName" className="form-label">
                <i className="fas fa-cog icon-secondary"></i>
                Worker Name *
              </label>

              <input
                type="text"
                id="workerName"
                value={formData.workerName}
                onChange={(e) =>
                  handleInputChange("workerName", e.target.value)
                }
                placeholder="Enter Worker name"
                className="form-input form-input-text"
                required
              />
            </div>

            {/* Error Message */}
            {connectionError && (
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
                  Connection Failed
                </h4>
                <p style={{ margin: "0", fontSize: "0.9rem", color: "#666" }}>
                  {connectionError}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="nice-button button-full-width"
              disabled={isConnecting}
            >
              {isConnecting ? (
                <>
                  <div
                    className="loading-spinner"
                    style={{
                      width: "16px",
                      height: "16px",
                      marginRight: "0.5rem",
                    }}
                  ></div>
                  Connecting...
                </>
              ) : (
                <>
                  <i className="fas fa-plug"></i>
                  Connect
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
