// src/App.tsx

import { useState, useEffect } from "react";
import "./App.css";
import "./ReleasePlanTable.css";
import { PlanTabs } from "./PlanTabs";
import type { components } from "../../types/api";

type Plan = components["schemas"]["Plan"];

function App() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch initial plan from API
  useEffect(() => {
    const fetchPlan = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/plan');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch plan: ${response.status} ${response.statusText}`);
        }
        
        const planData: Plan = await response.json();
        setPlan(planData);
      } catch (err) {
        console.error('Error fetching plan:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch plan');
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, []);

  const handleSave = async (updatedPlan: Plan) => {
    try {
      setSaveSuccess(false); // Clear any previous success state
      console.log('Plan saved:', updatedPlan);
      
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedPlan),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save plan: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setPlan(data); // Update local state with saved plan
      setSaveSuccess(true); // Show success message
      console.log('Server response:', data);
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving plan:', error);
      alert(`Failed to save plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">Workers HMD</h1>
        <p className="app-subtitle">Health Mediated Deployments for Cloudflare Workers</p>
      </header>
      
      <main>
        {loading && (
          <div className="loading-container">
            <div className="loading-text">
              Loading release plan...
            </div>
            <div className="loading-spinner"></div>
          </div>
        )}
        
        {error && (
          <div className="error-container">
            <div className="error-box">
              <h3 className="error-title">Error Loading Plan</h3>
              <p className="error-message">{error}</p>
            </div>
            <button 
              onClick={handleRetry}
              className="retry-button"
            >
              Retry
            </button>
          </div>
        )}
        
        {plan && (
          <PlanTabs
            initialPlan={plan}
            onSave={handleSave}
            saveSuccess={saveSuccess}
          />
        )}
      </main>
      

    </>
  );
}

export default App;
