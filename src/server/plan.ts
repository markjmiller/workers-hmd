import { DurableObject } from "cloudflare:workers";
import type { components } from "../../types/api";

type Plan = components["schemas"]["Plan"];

export class PlanStorage extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async getPlan(id: string): Promise<Plan> {
    let plan = await this.ctx.storage.get(id) as Plan;
    if (!plan) {
      plan = {
        stages: [
          {
            order: 0,
            description: "",
            target_percent: 10,
            soak_time: 60,
            auto_progress: false,
          },
          {
            order: 1,
            description: "",
            target_percent: 50,
            soak_time: 60,
            auto_progress: false,
          },
          {
            order: 2,
            description: "",
            target_percent: 100,
            soak_time: 60,
            auto_progress: false,
          },
        ],
        slos: [
          { value: "latency p999 < 100ms" },
        ],
      };
      await this.ctx.storage.put(id, plan);
    }
    return plan;
  }

  async updatePlan(id: string, plan: Plan): Promise<Plan> {
    const _plan = {...plan, time_last_saved: new Date().toISOString()};
    await this.ctx.storage.put(id, _plan);
    return _plan;
  }

  async getPlanById(id: string): Promise<Plan | undefined> {
    return await this.ctx.storage.get(id);
  }
}
