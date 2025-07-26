// Types based on the API schema
export interface PlanStage {
  order: number;
  target_percent: number;
  soak_time: number;
  auto_progress: boolean;
  description?: string;
}

export interface SLO {
  value: string;
}

export interface Plan {
  stages: PlanStage[];
  slos: SLO[];
}
