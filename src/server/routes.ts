import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { validator } from "hono/validator";
import type { components } from "../../types/api";
import { PlanStorage } from "./plan";
import { ReleaseHistory } from "./releaseHistory";

type Plan = components["schemas"]["Plan"];
type Release = components["schemas"]["Release"];
type ReleaseStage = components["schemas"]["ReleaseStage"];

function isValidId(value: string): boolean {
  return value.match(/^[0-9a-fA-F]{8}$/g) !== null;
}

declare module "hono" {
  interface ContextVariableMap {
    plan: DurableObjectStub<PlanStorage>;
    releaseHistory: DurableObjectStub<ReleaseHistory>;
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
    const plan = await c.env.PLAN_STORAGE.get(c.env.PLAN_STORAGE.idFromName("main")).getPlan("main");
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
    const updatedPlan = await c.env.PLAN_STORAGE.get(c.env.PLAN_STORAGE.idFromName("main")).updatePlan("main", plan);
    return c.json<Plan>(updatedPlan, 200);
  } catch (error) {
    console.error("Error updating plan:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release", async (c) => {
  try {
    // Parse query parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    const since = c.req.query("since");
    const until = c.req.query("until");
    const state = c.req.query("state");
    
    // Validate parameters
    if (limit < 1 || limit > 100) {
      return c.json({ message: "Limit must be between 1 and 100", ok: false }, 400);
    }
    if (offset < 0) {
      return c.json({ message: "Offset must be non-negative", ok: false }, 400);
    }
    
    const releaseHistory = c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
    let releases = await releaseHistory.getAllReleases();
    
    // Apply timestamp filters
    if (since) {
      const sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return c.json({ message: "Invalid 'since' timestamp format", ok: false }, 400);
      }
      releases = releases.filter(release => 
        new Date(release.time_created) >= sinceDate
      );
    }
    
    if (until) {
      const untilDate = new Date(until);
      if (isNaN(untilDate.getTime())) {
        return c.json({ message: "Invalid 'until' timestamp format", ok: false }, 400);
      }
      releases = releases.filter(release => 
        new Date(release.time_created) <= untilDate
      );
    }
    
    // Apply state filter
    if (state) {
      const validStates = ["not_started", "running", "done_successful", "done_stopped_manually", "done_failed_slo"];
      if (!validStates.includes(state)) {
        return c.json({ message: `Invalid state. Must be one of: ${validStates.join(", ")}`, ok: false }, 400);
      }
      releases = releases.filter(release => release.state === state);
    }
    
    // Apply pagination
    const paginatedReleases = releases.slice(offset, offset + limit);
    
    return c.json(paginatedReleases, 200);
  } catch (error) {
    console.error("Error getting releases:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/release", async (c) => {
  try {
    const releaseHistory = c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
    
    // Check if there's already an active release
    const hasActiveRelease = await releaseHistory.hasActiveRelease();
    if (hasActiveRelease) {
      return c.json({ message: "A release is already staged", ok: false }, 409);
    }
    
    // Create release from current plan
    const plan = await c.env.PLAN_STORAGE.get(c.env.PLAN_STORAGE.idFromName("main")).getPlan("main");
    const releaseId = crypto.randomUUID().replace(/-/g, '').substring(0, 8);
    const currentTime = new Date().toISOString();
    
    const newRelease: Release = {
      id: releaseId,
      state: "not_started",
      plan_record: plan,
      stages: plan.stages.map((stage) => ({
        id: `stage-${releaseId}-${stage.order}`,
        order: stage.order,
        state: "queued" as const,
        time_started: "",
        time_elapsed: 0,
        time_done: "",
        logs: "",
      })),
      time_created: currentTime,
      time_started: "",
      time_elapsed: 0,
      time_done: "",
    };
    
    const createdRelease = await releaseHistory.createRelease(newRelease);
    return c.json(createdRelease, 200);
  } catch (error) {
    console.error("Error creating release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release/active", async (c) => {
  try {
    const releaseHistory = c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
    const activeRelease = await releaseHistory.getActiveRelease();
    
    if (!activeRelease) {
      return c.json({ message: "No active release found", ok: false }, 404);
    }
    
    return c.json(activeRelease, 200);
  } catch (error) {
    console.error("Error getting active release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release/:releaseId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    if (!isValidId(releaseId)) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    const releaseHistory = c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
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

api.post("/release/:releaseId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    if (!isValidId(releaseId)) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    // According to the OpenAPI spec, the content type should be application/text
    const command = await c.req.text();
    
    if (command !== "start" && command !== "stop") {
      return c.json({ message: "Invalid command: must be 'start' or 'stop'", ok: false }, 400);
    }
    
    const releaseHistory = c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
    const release = await releaseHistory.getRelease(releaseId);
    
    if (!release) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }

    // Simulate a delay to see UI states
    // TODO: don't forget to eventually remove this
    await (function sleep(milliseconds) {
      return new Promise(r=>setTimeout(r, milliseconds));
    })(1000);
    
    if (command === "start") {
      // Only allow starting if release is in not_started state
      if (release.state !== "not_started") {
        return c.json({ 
          message: `Cannot start release in '${release.state}' state`, 
          ok: false 
        }, 400);
      }
      
      // Update release state to running
      const updated = await releaseHistory.updateReleaseState(releaseId, "running");
      if (!updated) {
        return c.json({ message: "Failed to update release state", ok: false }, 500);
      }
      
      return c.text("Release started successfully", 200);
    } else if (command === "stop") {
      // Only allow stopping if release is in running state
      if (release.state !== "running") {
        return c.json({ 
          message: `Cannot stop release in '${release.state}' state`, 
          ok: false 
        }, 400);
      }
      
      // Update release state to done_stopped_manually
      const updated = await releaseHistory.updateReleaseState(releaseId, "done_stopped_manually");
      if (!updated) {
        return c.json({ message: "Failed to update release state", ok: false }, 500);
      }
      
      return c.text("Release stopped successfully", 200);
    }
  } catch (error) {
    console.error("Error controlling release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.delete("/release/:releaseId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    if (!isValidId(releaseId)) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    const releaseHistory = c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
    
    // Get the release to check its state
    const release = await releaseHistory.getRelease(releaseId);
    if (!release) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    // According to OpenAPI spec, can only delete releases in "not_started" state
    if (release.state !== "not_started") {
      return c.json({ 
        message: "Release has to be in a \"not_started\" state", 
        ok: false 
      }, 409);
    }
    
    // Delete the release
    const deleted = await releaseHistory.removeRelease(releaseId);
    if (!deleted) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    return c.text("Release deleted", 200);
  } catch (error) {
    console.error("Error deleting release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release/:releaseId/stage/:releaseStageId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    const releaseStageId = c.req.param("releaseStageId");
    
    if (!isValidId(releaseId)) {
      return c.json({ message: "Release stage not found", ok: false }, 404);
    }
    
    // Get the release from storage
    const releaseHistory = c.env.RELEASE_HISTORY.get(c.env.RELEASE_HISTORY.idFromName("main"));
    const release = await releaseHistory.getRelease(releaseId);
    
    if (!release) {
      return c.json({ message: "Release not found", ok: false }, 404);
    }
    
    // Find the specific stage within the release
    const stage = release.stages.find(s => s.id === releaseStageId);
    
    if (!stage) {
      return c.json({ message: "Release stage not found", ok: false }, 404);
    }
    
    return c.json(stage, 200);
  } catch (error) {
    console.error("Error getting release stage:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/release/:releaseId/stage/:releaseStageId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    const releaseStageId = c.req.param("releaseStageId");
    
    if (!isValidId(releaseId)) {
      return c.json({ message: "Release stage not found", ok: false }, 404);
    }
    
    const command = await c.req.text();
    
    if (command !== "approve" && command !== "deny") {
      return c.json({ message: "Invalid command: must be 'approve' or 'deny'", ok: false }, 400);
    }
    
    // TODO: Implement actual stage progression logic
    
    return c.text("Stage progressed successfully", 200);
  } catch (error) {
    console.error("Error progressing release stage:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

app.route("/api", api);

export { PlanStorage, ReleaseHistory };
export default app;
