import React, { useState, useEffect } from "react";
import "./TimeInput.css";

interface TimeInputProps {
  value: number; // Time in seconds
  onChange: (seconds: number) => void;
  className?: string;
  error?: boolean;
  min?: number; // Minimum seconds allowed
}

export const TimeInput: React.FC<TimeInputProps> = ({
  value,
  onChange,
  className = "",
  error = false,
  min = 1,
}) => {
  // Convert seconds to H:M:S components
  const secondsToComponents = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
  };

  // Convert H:M:S components to total seconds
  const componentsToSeconds = (
    hours: number,
    minutes: number,
    seconds: number,
  ) => {
    return hours * 3600 + minutes * 60 + seconds;
  };

  const { hours, minutes, seconds } = secondsToComponents(value);
  const [hoursStr, setHoursStr] = useState(hours.toString());
  const [minutesStr, setMinutesStr] = useState(
    minutes.toString().padStart(2, "0"),
  );
  const [secondsStr, setSecondsStr] = useState(
    seconds.toString().padStart(2, "0"),
  );

  // Update local state when value prop changes
  useEffect(() => {
    const { hours, minutes, seconds } = secondsToComponents(value);
    setHoursStr(hours.toString());
    setMinutesStr(minutes.toString().padStart(2, "0"));
    setSecondsStr(seconds.toString().padStart(2, "0"));
  }, [value]);

  const handleFieldChange = (
    field: "hours" | "minutes" | "seconds",
    newValue: string,
  ) => {
    let numValue = parseInt(newValue, 10);
    if (isNaN(numValue) || numValue < 0) numValue = 0;

    // Apply field-specific constraints
    if (field === "minutes" || field === "seconds") {
      numValue = Math.min(numValue, 59);
    }

    // Update local state
    let newHours = field === "hours" ? numValue : parseInt(hoursStr, 10) || 0;
    let newMinutes =
      field === "minutes" ? numValue : parseInt(minutesStr, 10) || 0;
    let newSeconds =
      field === "seconds" ? numValue : parseInt(secondsStr, 10) || 0;

    const totalSeconds = componentsToSeconds(newHours, newMinutes, newSeconds);

    // Only call onChange if the total meets minimum requirement
    if (totalSeconds >= min) {
      onChange(totalSeconds);
    }

    // Update display regardless (for immediate visual feedback)
    if (field === "hours") setHoursStr(newValue);
    if (field === "minutes") setMinutesStr(newValue);
    if (field === "seconds") setSecondsStr(newValue);
  };

  const handleFieldBlur = (field: "hours" | "minutes" | "seconds") => {
    // Ensure proper formatting on blur
    const { hours, minutes, seconds } = secondsToComponents(value);
    if (field === "hours") setHoursStr(hours.toString());
    if (field === "minutes") setMinutesStr(minutes.toString().padStart(2, "0"));
    if (field === "seconds") setSecondsStr(seconds.toString().padStart(2, "0"));
  };

  const handleFieldFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  return (
    <div
      className={`time-input-container ${className} ${error ? "error" : ""}`}
    >
      <div className="time-input-fields">
        <input
          type="number"
          min="0"
          value={hoursStr}
          onChange={(e) => handleFieldChange("hours", e.target.value)}
          onBlur={() => handleFieldBlur("hours")}
          onFocus={handleFieldFocus}
          className="time-input-field hours"
          title="Hours"
        />
        <span className="time-separator">:</span>
        <input
          type="number"
          min="0"
          max="59"
          value={minutesStr}
          onChange={(e) => handleFieldChange("minutes", e.target.value)}
          onBlur={() => handleFieldBlur("minutes")}
          onFocus={handleFieldFocus}
          className="time-input-field minutes"
          title="Minutes (0-59)"
        />
        <span className="time-separator">:</span>
        <input
          type="number"
          min="0"
          max="59"
          value={secondsStr}
          onChange={(e) => handleFieldChange("seconds", e.target.value)}
          onBlur={() => handleFieldBlur("seconds")}
          onFocus={handleFieldFocus}
          className="time-input-field seconds"
          title="Seconds (0-59)"
        />
      </div>
      <span className="time-input-label">H:M:S</span>
    </div>
  );
};
