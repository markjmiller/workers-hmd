import { DurableObject } from "cloudflare:workers";
import type { components } from "../../types/api";

type Plan = components["schemas"]["Plan"];

export class PlanStorage extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async get(): Promise<Plan> {
    let plan = (await this.ctx.storage.get("main")) as Plan;
    if (!plan) {
      plan = {
        stages: [
          {
            order: 1,
            description: "",
            target_percent: 10,
            soak_time: 60,
            auto_progress: false,
          },
          {
            order: 2,
            description: "",
            target_percent: 50,
            soak_time: 60,
            auto_progress: false,
          },
          {
            order: 3,
            description: "",
            target_percent: 100,
            soak_time: 60,
            auto_progress: false,
          },
        ],
        slos: [
          {
            percentile: "p999",
            latency_ms: 100,
          },
        ],
        worker_name: "my-worker",
        polling_fraction: 0.5,
      };
      await this.ctx.storage.put("main", plan);
    }
    return plan;
  }

  async updatePlan(plan: Plan): Promise<Plan> {
    const _plan = { ...plan, time_last_saved: new Date().toISOString() };
    await this.ctx.storage.put("main", _plan);
    return _plan;
  }
}
