import React from "react";
import "./SloForm.css";

export interface SloFormData {
  percentile: "p999" | "p99" | "p90" | "median";
  latency_ms: number;
}

interface SloFormProps {
  value: SloFormData;
  onChange: (value: SloFormData) => void;
  onValidationError: (error: string | null) => void;
}

const SloForm: React.FC<SloFormProps> = ({
  value,
  onChange,
  onValidationError,
}) => {
  // Use the external value directly, no internal state needed
  const formData = value || {
    percentile: "p99",
    latency_ms: 100,
  };

  // Validate form data
  const validateForm = (data: SloFormData): string | null => {
    if (data.latency_ms <= 0) {
      return "Latency must be greater than 0ms";
    }
    if (data.latency_ms > 60000) {
      return "Latency must be less than 60000ms (1 minute)";
    }
    return null;
  };

  // Validate and notify parent of validation errors
  React.useEffect(() => {
    const validationError = validateForm(formData);
    onValidationError(validationError);
  }, [formData.percentile, formData.latency_ms]); // Only depend on actual data values

  const handlePercentileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...formData,
      percentile: e.target.value as SloFormData["percentile"],
    });
  };

  const handleLatencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const latency_ms = parseInt(e.target.value) || 0;
    onChange({
      ...formData,
      latency_ms,
    });
  };

  return (
    <div className="slo-form">
      <div className="slo-form-row">
        <div className="slo-form-field">
          <label htmlFor="percentile-select" className="slo-form-label">
            Percentile
          </label>
          <select
            id="percentile-select"
            value={formData.percentile}
            onChange={handlePercentileChange}
            className="slo-form-select"
          >
            <option value="median">Median</option>
            <option value="p90">p90</option>
            <option value="p99">p99</option>
            <option value="p999">p999</option>
          </select>
        </div>

        <div className="slo-form-field">
          <label htmlFor="latency-input" className="slo-form-label">
            Latency (ms)
          </label>
          <input
            id="latency-input"
            type="number"
            min="1"
            max="60000"
            value={formData.latency_ms}
            onChange={handleLatencyChange}
            className="slo-form-input"
            placeholder="100"
          />
        </div>
      </div>

      <div className="slo-preview">
        <small className="slo-preview-text">
          Preview: {formData.percentile} latency &lt; {formData.latency_ms}ms
        </small>
      </div>
    </div>
  );
};

export default SloForm;
