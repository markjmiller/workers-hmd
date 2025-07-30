import React, { useState } from 'react';

export const Instructions: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={toggleExpanded}
        style={{
          width: '100%',
          padding: '0.75rem 1rem',
          border: '1px solid #e1e5e9',
          borderRadius: '6px',
          backgroundColor: '#f8f9fa',
          color: '#495057',
          fontSize: '0.95rem',
          fontWeight: '500',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#e9ecef';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#f8f9fa';
        }}
      >
        <span>Instructions</span>
        <i 
          className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}
          style={{ fontSize: '0.8rem', transition: 'transform 0.2s ease' }}
        ></i>
      </button>
      
      {isExpanded && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '1rem',
            border: '1px solid #e1e5e9',
            borderRadius: '6px',
            backgroundColor: '#ffffff',
            maxHeight: '300px',
            overflowY: 'auto',
            fontSize: '0.9rem',
            lineHeight: '1.5',
            color: '#495057'
          }}
        >
          {/* Placeholder content - user will fill this in later */}
          <p style={{ margin: '0 0 1rem 0' }}>
            <strong>Welcome to Workers HMD!</strong>
          </p>
          <p style={{ margin: '0 0 1rem 0' }}>
            This section will contain detailed instructions on how to use the Workers Health Mediated Deployment system.
          </p>
          <div style={{ padding: '0.75rem', backgroundColor: '#f8f9fa', borderRadius: '4px', marginBottom: '1rem' }}>
            <em>Content will be added here...</em>
          </div>
          <ul style={{ margin: '0', paddingLeft: '1.2rem' }}>
            <li>Step-by-step deployment guides</li>
            <li>Configuration examples</li>
            <li>Troubleshooting tips</li>
            <li>Best practices</li>
          </ul>
        </div>
      )}
    </div>
  );
};
