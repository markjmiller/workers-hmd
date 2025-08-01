// src/App.tsx

import { useState } from "react";
import "./App.css";
import "./ReleasePlanTable.css";
import { Plan } from "./Plan";
import { AppTabs } from "./AppTabs";
import { Instructions } from "./Instructions";

function App() {
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleGlobalError = (error: string) => {
    setGlobalError(error);
  };

  const handleRetry = () => {
    setGlobalError(null);
    window.location.reload();
  };

  return (
    <>
      <header className="app-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.25em",
          }}
        >
          <img
            src="/workers-icon.svg"
            alt="Cloudflare Workers Logo"
            style={{ height: "2rem", width: "auto" }}
          />
          <h1 className="app-title">Workers HMD</h1>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
        >
          <p className="app-subtitle">
            Health Mediated Deployments for{" "}
            <a
              href="https://workers.cloudflare.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="help-link"
            >
              Cloudflare Workers{" "}
              <i
                className="fas fa-external-link-alt"
                style={{ marginRight: "0.5rem" }}
              ></i>
            </a>
          </p>
          <small
            style={{
              backgroundColor: "#ffd700",
              padding: "0.5em",
              borderRadius: "4px",
              color: "#333",
            }}
          >
            <i
              className="fas fa-exclamation-triangle"
              style={{ marginRight: "0.5em" }}
            ></i>
            This is a demo. Please don't use it for production!
          </small>
        </div>
      </header>

      <main>
        {globalError && (
          <div className="error-container">
            <div className="error-box">
              <h3 className="error-title">Application Error</h3>
              <p className="error-message">{globalError}</p>
            </div>
            <button onClick={handleRetry} className="retry-button">
              Retry
            </button>
          </div>
        )}

        {!globalError && (
          <>
            <Instructions />
            <AppTabs planEditor={<Plan onError={handleGlobalError} />} />
          </>
        )}
      </main>
    </>
  );
}

export default App;
