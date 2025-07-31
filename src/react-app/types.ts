// Types based on the API schema
export interface PlanStage {
  order: number;
  target_percent: number;
  soak_time: number;
  auto_progress: boolean;
  description?: string;
}

export interface SLO {
  percentile: "p999" | "p99" | "p90" | "median";
  latency_ms: number;
}

export interface Plan {
  stages: PlanStage[];
  slos: SLO[];
}
