// src/App.tsx

import { useState } from "react";
import "./App.css";
import "./ReleasePlanTable.css";
import { Plan } from "./Plan";

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
        <h1 className="app-title">Workers HMD</h1>
        <p className="app-subtitle">Health Mediated Deployments for <a href="https://workers.cloudflare.com/" target="_blank">Cloudflare Workers</a></p>
      </header>
      
      <main>
        {globalError && (
          <div className="error-container">
            <div className="error-box">
              <h3 className="error-title">Application Error</h3>
              <p className="error-message">{globalError}</p>
            </div>
            <button 
              onClick={handleRetry}
              className="retry-button"
            >
              Retry
            </button>
          </div>
        )}
        
        {!globalError && (
          <Plan onError={handleGlobalError} />
        )}
      </main>
    </>
  );
}

export default App;
