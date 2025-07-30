import React, { useState, useEffect } from 'react';

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
    apiToken: '',
    accountId: '',
    workerName: ''
  });

  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Check if already connected on component mount
  useEffect(() => {
    const savedConnection = sessionStorage.getItem('workerConnection');
    if (savedConnection) {
      try {
        const connection = JSON.parse(savedConnection);
        setFormData(connection);
        setIsConnected(true);
        onConnectionChange(true);
      } catch (error) {
        console.error('Error parsing saved connection:', error);
      }
    }
  }, [onConnectionChange]);

  const handleInputChange = (field: keyof WorkerConnection, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.apiToken || !formData.accountId || !formData.workerName) {
      alert('Please fill in all fields');
      return;
    }

    // Store connection info in session storage
    sessionStorage.setItem('workerConnection', JSON.stringify(formData));
    setIsConnected(true);
    onConnectionChange(true);
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem('workerConnection');
    setFormData({
      apiToken: '',
      accountId: '',
      workerName: ''
    });
    setIsConnected(false);
    onConnectionChange(false);
  };

  if (isConnected) {
    return (
      <div className="tab-content">
        <div style={{ padding: '1rem' }}>
          {/* Connected Status Card */}
          <div className="card-connected">
            {/* Status Header */}
            <div className="status-header">
              <div className="status-icon">
                ✓
              </div>
              <h3 className="status-title" style={{ margin: '0' }}>
                Connected to Worker
              </h3>
            </div>
            
            {/* Worker Details */}
            <div className="status-details">
              <div className="status-detail-item">
                <i className="fas fa-cog icon-secondary"></i>
                <span className="status-detail-text">
                  <strong>Worker:</strong> 
                  <span className="status-detail-value status-detail-value-primary text-mono">
                    {formData.workerName}
                  </span>
                </span>
              </div>
              
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
                backgroundColor: '#dc3545',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
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
            <h3 className="form-title">
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
                  <a 
                    href="https://developers.cloudflare.com/fundamentals/api/get-started/create-token/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="help-link"
                  >
                    <i className="fas fa-external-link-alt" style={{ marginRight: '0.5rem' }}></i>
                    How to create a token
                  </a>
                </div>
                <div className="help-warning-content">
                  <i className="fas fa-exclamation-triangle"></i>
                  <span>Don't share your API token anywhere you don't trust!</span>
                </div>
              </div>
              
              <input
                type="password"
                id="apiToken"
                value={formData.apiToken}
                onChange={(e) => handleInputChange('apiToken', e.target.value)}
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
                  <i className="fas fa-external-link-alt" style={{ marginRight: '0.5rem' }}></i>
                  Find your account ID
                </a>
              </div>
              
              <input
                type="text"
                id="accountId"
                value={formData.accountId}
                onChange={(e) => handleInputChange('accountId', e.target.value)}
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
                onChange={(e) => handleInputChange('workerName', e.target.value)}
                placeholder="Enter Worker name"
                className="form-input form-input-text"
                required
              />
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              className="nice-button button-full-width"
            >
              <i className="fas fa-plug"></i>
              Connect
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
