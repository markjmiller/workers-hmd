/**
 * Server-side utility for evaluating SLO JSON configurations against observability data
 */

export interface SLOConfig {
  percentile: "p999" | "p99" | "p90" | "median";
  latency_ms: number;
}

export interface ObservabilityMetrics {
  p999: number;
  p99: number;
  p90: number;
  median: number;
}

export interface SLOViolation {
  percentile: string;
  expected_max_ms: number;
  actual_ms: number;
  violation_margin_ms: number;
}

export interface SLOEvaluationResult {
  passed: boolean;
  violations: SLOViolation[];
  polling_interval_seconds?: number;
  summary: string;
}

export class SLOEvaluator {
  /**
   * Evaluates a list of SLO configurations against observability metrics
   */
  static evaluateSLOs(
    sloConfigs: SLOConfig[],
    metrics: ObservabilityMetrics,
  ): SLOEvaluationResult {
    const violations: SLOViolation[] = [];

    // Check each SLO configuration
    for (const slo of sloConfigs) {
      const actualValue = this.getMetricValue(metrics, slo.percentile);

      if (actualValue > slo.latency_ms) {
        violations.push({
          percentile: slo.percentile,
          expected_max_ms: slo.latency_ms,
          actual_ms: actualValue,
          violation_margin_ms: actualValue - slo.latency_ms,
        });
      }
    }

    const passed = violations.length === 0;
    const summary = passed
      ? `All ${sloConfigs.length} SLO(s) passed`
      : `${violations.length} of ${sloConfigs.length} SLO(s) violated: ${violations
          .map(
            (v) =>
              `${v.percentile} ${v.actual_ms}ms > ${v.expected_max_ms}ms (+${v.violation_margin_ms}ms)`,
          )
          .join(", ")}`;

    return {
      passed,
      violations,
      summary,
    };
  }

  /**
   * Get the metric value for a specific percentile
   */
  private static getMetricValue(
    metrics: ObservabilityMetrics,
    percentile: SLOConfig["percentile"],
  ): number {
    switch (percentile) {
      case "p999":
        return metrics.p999;
      case "p99":
        return metrics.p99;
      case "p90":
        return metrics.p90;
      case "median":
        return metrics.median;
      default:
        throw new Error(`Unknown percentile: ${percentile}`);
    }
  }

  /**
   * Parse SLO configurations from the release plan format
   * Expects JSON format with percentile and latency_ms properties
   */
  static parseSLOsFromPlan(slos: any[]): SLOConfig[] {
    const parsedSLOs: SLOConfig[] = [];

    for (const slo of slos) {
      if (typeof slo === "object" && slo.percentile && slo.latency_ms) {
        // JSON format validation
        if (
          ["p999", "p99", "p90", "median"].includes(slo.percentile) &&
          typeof slo.latency_ms === "number" &&
          slo.latency_ms > 0
        ) {
          parsedSLOs.push({
            percentile: slo.percentile,
            latency_ms: slo.latency_ms,
          });
        }
      }
    }

    return parsedSLOs;
  }
}
