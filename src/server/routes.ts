import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { validator } from "hono/validator";
import type { components } from "../../types/api";
import { Cloudflare as cf } from "cloudflare";
import { PlanStorage } from "./plan";
import { StageStorage } from "./stage";
import { ReleaseHistory } from "./releaseHistory";
import { ReleaseWorkflow, ReleaseWorkflowParams } from "./releaseWorkflow";

type Plan = components["schemas"]["Plan"];
type Release = components["schemas"]["Release"];

function isValidId(value: string): boolean {
  return value.match(/^[0-9a-fA-F]{8}$/g) !== null;
}

function isValidStageId(value: string): boolean {
  return value.match(/^release-[0-9a-fA-F]{8}-order-[0-9]+$/g) !== null;
}

function getStageId(releaseId: string, stageOrder: string | number): string {
  return `release-${releaseId}-order-${stageOrder}`;
}

// Helper functions to reduce duplication
function getMainReleaseHistory(c: any) {
  return c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
}

function getMainPlanStorage(c: any) {
  return c.env.PLAN_STORAGE.get(c.env.PLAN_STORAGE.idFromName("main"));
}

function getStageStorage(c: any, stageId: string) {
  return c.env.STAGE_STORAGE.get(c.env.STAGE_STORAGE.idFromName(stageId));
}

const VALID_STATES = ["not_started", "running", "done_successful", "done_stopped_manually", "done_failed_slo"];

declare module "hono" {
  interface ContextVariableMap {
    plan: DurableObjectStub<PlanStorage>;
    releaseHistory: DurableObjectStub<ReleaseHistory>;
    releaseWorkflow: Workflow<ReleaseWorkflowParams>;
  }
}

const app = new Hono<{ Bindings: Cloudflare.Env }>();
app.use(prettyJSON());
app.notFound((c) => c.json({ message: "Not Found", ok: false }, 404));
app.get("/", async (c) =>
  c.env.ASSETS.fetch("https://assets.local/index.html"),
);
app.get("/docs", async (c) =>
  c.env.ASSETS.fetch("https://assets.local/docs/openapi.html"),
);

const api = new Hono<{ Bindings: Cloudflare.Env }>();

api.get("/plan", async (c) => {
  try {
    const plan = await getMainPlanStorage(c).getPlan();
    return c.json<Plan>(plan, 200);
  } catch (error) {
    console.error("Error getting plan:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/plan", validator("json", (value, c) => {
  const plan = value as Plan;
  if (!plan.stages || !Array.isArray(plan.stages) || !plan.slos || !Array.isArray(plan.slos)) {
    return c.json({ message: "Invalid plan: must include stages and slos arrays", ok: false }, 400);
  }
  return plan;
}), async (c) => {
  try {
    const plan = c.req.valid("json");
    const updatedPlan = await getMainPlanStorage(c).updatePlan(plan);
    return c.json<Plan>(updatedPlan, 200);
  } catch (error) {
    console.error("Error updating plan:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    const since = c.req.query("since");
    const until = c.req.query("until");
    const state = c.req.query("state");
    
    if (limit < 1 || limit > 100) {
      return c.json({ message: "Limit must be between 1 and 100", ok: false }, 400);
    }
    if (offset < 0) {
      return c.json({ message: "Offset must be non-negative", ok: false }, 400);
    }
    
    const releaseHistory = getMainReleaseHistory(c);
    let releases = await releaseHistory.getAllReleases();
    
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return c.json({ message: "Invalid 'since' timestamp format", ok: false }, 400);
      }
      releases = releases.filter((release: Release) => new Date(release.time_created) >= sinceDate);
    }
    
    if (until) {
      const untilDate = new Date(until);
      if (isNaN(untilDate.getTime())) {
        return c.json({ message: "Invalid 'until' timestamp format", ok: false }, 400);
      }
      releases = releases.filter((release: Release) => new Date(release.time_created) <= untilDate);
    }
    
    if (state) {
      if (!VALID_STATES.includes(state)) {
        return c.json({ message: `Invalid state. Must be one of: ${VALID_STATES.join(", ")}`, ok: false }, 400);
      }
      releases = releases.filter((release: Release) => release.state === state);
    }
    
    const paginatedReleases = releases.slice(offset, offset + limit);
    return c.json(paginatedReleases, 200);
  } catch (error) {
    console.error("Error getting releases:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/release", async (c) => {
  try {
    const releaseHistory = getMainReleaseHistory(c);
    
    const hasActiveRelease = await releaseHistory.hasActiveRelease();
    if (hasActiveRelease) {
      return c.json({ message: "A release is already staged", ok: false }, 409);
    }
    
    // Parse request body to get version information
    const requestBody = await c.req.json().catch(() => ({}));
    const { old_version, new_version } = requestBody;
    
    const plan = await getMainPlanStorage(c).getPlan();
    const releaseId = crypto.randomUUID().replace(/-/g, '').substring(0, 8);
    const currentTime = new Date().toISOString();
    
    const newRelease: Release = {
      id: releaseId,
      state: "not_started",
      plan_record: plan,
      old_version: old_version || "",
      new_version: new_version || "",
      stages: plan.stages.map((stage: any) => ({ id: `release-${releaseId}-order-${stage.order}`, order: stage.order })),
      time_created: currentTime,
      time_started: "",
      time_elapsed: 0,
      time_done: "",
    };

    for (const planStage of plan.stages) {
      const stageId = getStageId(releaseId, planStage.order);
      const stageStorage = getStageStorage(c, stageId);
      await stageStorage.initialize({
          id: stageId,
          order: planStage.order,
          releaseId: releaseId,
          state: "queued",
          time_started: "",
          time_elapsed: 0,
          time_done: "",
          logs: "",
      });
    }
    
    const createdRelease = await releaseHistory.createRelease(newRelease);
    return c.json(createdRelease, 200);
  } catch (error) {
    console.error("Error creating release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release/active", async (c) => {
  try {
    const releaseHistory = getMainReleaseHistory(c);
    const activeRelease = await releaseHistory.getActiveRelease();
    
    // Always return 200 OK - null when no active release, release object when active
    return c.json(activeRelease ?? null, 200);
  } catch (error) {
    console.error("Error getting active release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/release/active", async (c) => {
  try {
    const releaseHistory = getMainReleaseHistory(c);
    const activeRelease = await releaseHistory.getActiveRelease();
    
    if (!activeRelease) {
      return c.json({ message: "No active release found", ok: false }, 404);
    }
    
    const requestBody = await c.req.json();
    const { command, account_id, api_token } = requestBody;
    
    if (!command || (command !== "start" && command !== "stop")) {
      return c.json({ message: "Invalid command: must be 'start' or 'stop'", ok: false }, 400);
    }

    const activeReleaseId = activeRelease.id;

    if (command === "start") {
      // Only allow starting if release is in not_started state
      if (activeRelease.state !== "not_started") {
        return c.json({ 
          message: `Cannot start release in '${activeRelease.state}' state`, 
          ok: false 
        }, 400);
      }

      const releaseWorkflow = await c.env.RELEASE_WORKFLOW.create({
        id: activeReleaseId,
        params: { releaseId: activeReleaseId, accountId: account_id, apiToken: api_token }
      });
      
      await releaseHistory.updateReleaseState(activeReleaseId, "running");

      releaseWorkflow.sendEvent({ type: "release-start", payload: null });
      
      return c.text("Release started successfully", 200);
    } else if (command === "stop") {
      // Only allow stopping if release is in running state
      if (activeRelease.state !== "running") {
        return c.json({ 
          message: `Cannot stop release in '${activeRelease.state}' state`, 
          ok: false 
        }, 400);
      }

      const updateStages = async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Update all non-completed stages to cancelled state
        const allStages = activeRelease.plan_record.stages;
        for (const stageInfo of allStages) {
          const stageStorage = c.env.STAGE_STORAGE.get(c.env.STAGE_STORAGE.idFromName(`release-${activeRelease.id}-order-${stageInfo.order}`));
          const currentStage = await stageStorage.get();
          // Only update stages that exist and are not already in a done state
          if (currentStage && !currentStage.state.startsWith('done_')) {
            await stageStorage.updateStageState("done_cancelled");
            console.log(`🚫 Set stage ${stageInfo.order} to done_cancelled due to release stop`);
          }
        }
      }

      await updateStages();

      // TODO: there is a race condition here because the workflow might still be running
      //       we should be able to terminate the workflow, but that method isn't implemented
      //       yet. When it is, I think we can await workflow.terminate()
      //
      //       For now, just wait for 5 seconds to ensure the workflow has had time to finish
      //       then update the stages to cancelled state
      //
      c.executionCtx.waitUntil(
        new Promise<void>((resolve) => {
          setTimeout(async () => {
            await updateStages();
            resolve()
          }, 5000)
        })
      );

      // Update release state to done_stopped_manually
      const updated = await releaseHistory.updateReleaseState(activeRelease.id, "done_stopped_manually");

      if (!updated) {
        return c.json({ message: "Failed to update release state", ok: false }, 500);
      }
      
      return c.text("Release stopped successfully", 200);
    }
  } catch (error) {
    console.error("Error controlling active release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.delete("/release/active", async (c) => {
  try {
    const releaseHistory = getMainReleaseHistory(c);
    const activeRelease = await releaseHistory.getActiveRelease();
    
    if (!activeRelease) {
      return c.json({ message: "No active release found", ok: false }, 404);
    }
    
    if (activeRelease.state !== "not_started") {
      return c.json({ 
        message: "Release has to be in a \"not_started\" state", 
        ok: false 
      }, 409);
    }
    
    const deleted = await releaseHistory.removeRelease(activeRelease.id);
    if (!deleted) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    return c.text("Release deleted", 200);
  } catch (error) {
    console.error("Error deleting active release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release/:releaseId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    if (!isValidId(releaseId)) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    const releaseHistory = getMainReleaseHistory(c);
    const release = await releaseHistory.getRelease(releaseId);
    
    if (!release) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    return c.json(release, 200);
  } catch (error) {
    console.error("Error getting release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/stage/:stageId", async (c) => {
  try {
    const stageId = c.req.param("stageId");
    
    if (!isValidStageId(stageId)) {
      return c.json({ message: "Stage not found", ok: false }, 404);
    }
    
    const stageStorage = getStageStorage(c, stageId);
    const stage = await stageStorage.get();
    
    if (!stage) {
      return c.json({ message: "Stage not found", ok: false }, 404);
    }
    
    return c.json(stage, 200);
  } catch (error) {
    console.error("Error getting stage:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/stage/:stageId", async (c) => {
  try {
    const stageId = c.req.param("stageId");
    
    if (!isValidStageId(stageId)) {
      return c.json({ message: "Stage not found", ok: false }, 404);
    }
    
    const command = await c.req.text();
    
    if (command !== "approve" && command !== "deny") {
      return c.json({ message: "Invalid command: must be 'approve' or 'deny'", ok: false }, 400);
    }
    
    const stageStorage = getStageStorage(c, stageId);
    await stageStorage.progressStage(command);

    const releaseId = (await stageStorage.get())?.releaseId;
    if (!releaseId) {
      return c.json({ message: "Stage not found", ok: false }, 404);
    }
    const releaseWorkflow = await c.env.RELEASE_WORKFLOW.get(releaseId);
    releaseWorkflow.sendEvent({ type: `${stageId}-user-progress-command`, payload: command });

    return c.text("Stage progressed successfully", 200);
  } catch (error) {
    console.error("Error progressing stage:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

// Worker versions proxy route
api.post("/worker/versions", 
  validator("json", (value, c) => {
    if (!value || typeof value !== "object") {
      return c.json({ message: "Invalid request body", ok: false }, 400);
    }
    
    const { worker_name, account_id, api_token } = value as Record<string, unknown>;
    
    if (!worker_name || typeof worker_name !== "string") {
      return c.json({ message: "worker_name is required and must be a string", ok: false }, 400);
    }
    
    if (!account_id || typeof account_id !== "string") {
      return c.json({ message: "account_id is required and must be a string", ok: false }, 400);
    }
    
    if (!api_token || typeof api_token !== "string") {
      return c.json({ message: "api_token is required and must be a string", ok: false }, 400);
    }
    
    return { worker_name, account_id, api_token };
  }),
  async (c) => {
    try {
      const { worker_name, account_id, api_token } = c.req.valid("json");
      
      // Create Cloudflare client with provided API token
      const client = new cf({
        apiToken: api_token,
      });
      
      // Fetch worker versions from Cloudflare API
      const response = await client.workers.scripts.versions.list(
        worker_name,
        {
          account_id: account_id,
        }
      );
      
      if (response.result?.items) {
        // Return the versions in the expected format
        return c.json({
          success: true,
          result: response.result.items.slice(0, 5) // Return only the 5 most recent
        });
      } else {
        return c.json({ 
          message: "No worker versions found. Please check your worker name.", 
          ok: false 
        }, 404);
      }
      
    } catch (error: any) {
      console.error("Error fetching worker versions:", error);
      
      // Handle specific Cloudflare API errors
      if (error.status === 401 || error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        return c.json({ 
          message: "Invalid API token. Please check your token and try again.", 
          ok: false 
        }, 401);
      } else if (error.status === 403 || error.message?.includes("403") || error.message?.includes("Forbidden")) {
        return c.json({ 
          message: "Access denied. Please check your account ID and token permissions.", 
          ok: false 
        }, 403);
      } else if (error.status === 404 || error.message?.includes("404") || error.message?.includes("Not Found")) {
        return c.json({ 
          message: "Worker not found. Please check your worker name and account ID.", 
          ok: false 
        }, 404);
      } else {
        return c.json({ 
          message: `Failed to fetch worker versions: ${error.message || 'Unknown error'}`, 
          ok: false 
        }, 500);
      }
    }
  }
);

// Worker deployments proxy route
api.post("/worker/deployments", 
  validator("json", (value, c) => {
    if (!value || typeof value !== "object") {
      return c.json({ message: "Invalid request body", ok: false }, 400);
    }
    
    const { worker_name, account_id, api_token } = value as Record<string, unknown>;
    
    if (!worker_name || typeof worker_name !== "string") {
      return c.json({ message: "worker_name is required and must be a string", ok: false }, 400);
    }
    
    if (!account_id || typeof account_id !== "string") {
      return c.json({ message: "account_id is required and must be a string", ok: false }, 400);
    }
    
    if (!api_token || typeof api_token !== "string") {
      return c.json({ message: "api_token is required and must be a string", ok: false }, 400);
    }
    
    return { worker_name, account_id, api_token };
  }),
  async (c) => {
    try {
      const { worker_name, account_id, api_token } = c.req.valid("json");
      
      // Create Cloudflare client with provided API token
      const client = new cf({
        apiToken: api_token,
      });
      
      // Fetch worker deployments from Cloudflare API
      const response = await client.workers.scripts.deployments.get(
        worker_name,
        {
          account_id: account_id,
        }
      );
      
      if (response) {
        // The deployment API returns data directly, wrap it in our expected format
        // Convert single deployment response to array format for consistency
        const deployments = Array.isArray(response) ? response : [response];
        return c.json({
          success: true,
          result: deployments
        });
      } else {
        return c.json({ 
          message: "No worker deployments found. Please check your worker name.", 
          ok: false 
        }, 404);
      }
      
    } catch (error: any) {
      console.error("Error fetching worker deployments:", error);
      
      // Handle specific Cloudflare API errors
      if (error.status === 401 || error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        return c.json({ 
          message: "Invalid API token. Please check your token and try again.", 
          ok: false 
        }, 401);
      } else if (error.status === 403 || error.message?.includes("403") || error.message?.includes("Forbidden")) {
        return c.json({ 
          message: "Access denied. Please check your account ID and token permissions.", 
          ok: false 
        }, 403);
      } else if (error.status === 404 || error.message?.includes("404") || error.message?.includes("Not Found")) {
        return c.json({ 
          message: "Worker not found. Please check your worker name and account ID.", 
          ok: false 
        }, 404);
      } else {
        return c.json({ 
          message: `Failed to fetch worker deployments: ${error.message || 'Unknown error'}`, 
          ok: false 
        }, 500);
      }
    }
  }
);

app.route("/api", api);

export { PlanStorage, ReleaseHistory, StageStorage, ReleaseWorkflow };
export default app;
