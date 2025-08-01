import React from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  icon,
}) => {
  return (
    <div
      className="empty-state"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem",
        textAlign: "center",
        color: "#666",
        minHeight: "200px",
      }}
    >
      {icon && (
        <div style={{ marginBottom: "1rem", fontSize: "2rem" }}>{icon}</div>
      )}
      <h3
        style={{
          margin: "0 0 0.5rem 0",
          fontSize: "1.25rem",
          fontWeight: "normal",
          color: "#333",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: "0 0 1.5rem 0",
          fontSize: "0.9rem",
          lineHeight: "1.4",
          maxWidth: "400px",
        }}
      >
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
