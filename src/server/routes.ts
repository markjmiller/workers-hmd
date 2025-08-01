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

/**
 * Get ReleaseHistory Durable Object stub with account-specific ID
 */
export function getReleaseHistory(
  env: Cloudflare.Env,
  connectionId: string,
): DurableObjectStub<ReleaseHistory> {
  return env.RELEASE_HISTORY.get(env.RELEASE_HISTORY.idFromName(connectionId));
}

/**
 * Get Plan Storage Durable Object stub with account-specific ID
 */
export function getPlanStorage(
  env: Cloudflare.Env,
  connectionId: string,
): DurableObjectStub<PlanStorage> {
  return env.PLAN_STORAGE.get(env.PLAN_STORAGE.idFromName(connectionId));
}

/**
 * Get Stage Storage Durable Object stub with stage-specific ID
 */
export function getStageStorage(
  env: Cloudflare.Env,
  stageId: string,
): DurableObjectStub<StageStorage> {
  return env.STAGE_STORAGE.get(env.STAGE_STORAGE.idFromName(stageId));
}

const VALID_STATES = [
  "not_started",
  "running",
  "done_successful",
  "done_stopped_manually",
  "done_failed_slo",
];

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

api.post(
  "/plan",
  validator("json", (value, c) => {
    const body = value as { connectionId: string };
    if (!body.connectionId) {
      return c.json(
        {
          message: "Missing required field: connectionId",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const { connectionId } = c.req.valid("json");
      const plan = await getPlanStorage(
        c.env,
        connectionId,
      ).get();
      return c.json<Plan>(plan, 200);
    } catch (error) {
      console.error("Error getting plan:", error);
      return c.json({ message: "Internal Server Error", ok: false }, 500);
    }
  },
);

api.put(
  "/plan",
  validator("json", (value, c) => {
    const body = value as {
      connectionId: string;
      plan: Plan;
    };
    if (
      !body.connectionId
    ) {
      return c.json(
        {
          message:
            "Missing required connectionId field",
          ok: false,
        },
        400,
      );
    }
    if (
      !body.plan ||
      !body.plan.stages ||
      !Array.isArray(body.plan.stages) ||
      !body.plan.slos ||
      !Array.isArray(body.plan.slos)
    ) {
      return c.json(
        {
          message: "Invalid plan: must include stages and slos arrays",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const { connectionId, plan } = c.req.valid("json");
      const updatedPlan = await getPlanStorage(
        c.env,
        connectionId,
      ).updatePlan(plan);
      return c.json<Plan>(updatedPlan, 200);
    } catch (error) {
      console.error("Error updating plan:", error);
      return c.json({ message: "Internal Server Error", ok: false }, 500);
    }
  },
);

api.post(
  "/release",
  validator("json", (value, c) => {
    const body = value as {
      connectionId: string;
      limit?: number;
      offset?: number;
      since?: string;
      until?: string;
      state?: string;
    };
    if (
      !body.connectionId
    ) {
      return c.json(
        {
          message:
            "Missing required connectionId field",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const {
        connectionId,
        limit = 50,
        offset = 0,
        since,
        until,
        state,
      } = c.req.valid("json");

      if (limit < 1 || limit > 100) {
        return c.json(
          { message: "Limit must be between 1 and 100", ok: false },
          400,
        );
      }
      if (offset < 0) {
        return c.json(
          { message: "Offset must be non-negative", ok: false },
          400,
        );
      }

      const releaseHistory = getReleaseHistory(
        c.env,
        connectionId,
      );
      let releases = await releaseHistory.getAllReleases();

      if (since) {
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
          return c.json(
            { message: "Invalid 'since' timestamp format", ok: false },
            400,
          );
        }
        releases = releases.filter(
          (release: Release) => new Date(release.time_created) >= sinceDate,
        );
      }

      if (until) {
        const untilDate = new Date(until);
        if (isNaN(untilDate.getTime())) {
          return c.json(
            { message: "Invalid 'until' timestamp format", ok: false },
            400,
          );
        }
        releases = releases.filter(
          (release: Release) => new Date(release.time_created) <= untilDate,
        );
      }

      if (state) {
        if (!VALID_STATES.includes(state)) {
          return c.json(
            {
              message: `Invalid state. Must be one of: ${VALID_STATES.join(", ")}`,
              ok: false,
            },
            400,
          );
        }
        releases = releases.filter(
          (release: Release) => release.state === state,
        );
      }

      const paginatedReleases = releases.slice(offset, offset + limit);
      return c.json(paginatedReleases, 200);
    } catch (error) {
      console.error("Error getting releases:", error);
      return c.json({ message: "Internal Server Error", ok: false }, 500);
    }
  },
);

api.post(
  "/release/create",
  validator("json", (value, c) => {
    const body = value as {
      connectionId: string;
      old_version?: string;
      new_version?: string;
    };
    if (!body.connectionId) {
      return c.json(
        {
          message: "Missing required connection fields: connectionId is required",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const { connectionId, old_version, new_version } =
        c.req.valid("json");
      const releaseHistory = getReleaseHistory(
        c.env,
        connectionId,
      );

      const hasActiveRelease = await releaseHistory.hasActiveRelease();
      if (hasActiveRelease) {
        return c.json(
          { message: "A release is already staged", ok: false },
          409,
        );
      }

      const planStorage = getPlanStorage(
        c.env,
        connectionId,
      );
      const plan = await planStorage.get();
      const releaseId = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
      const currentTime = new Date().toISOString();

      const newRelease: Release = {
        id: releaseId,
        state: "not_started",
        plan_record: plan,
        old_version: old_version || "",
        new_version: new_version || "",
        stages: plan.stages.map((stage: any) => ({
          id: `release-${releaseId}-order-${stage.order}`,
          order: stage.order,
        })),
        time_created: currentTime,
        time_started: "",
        time_elapsed: 0,
        time_done: "",
      };

      for (const planStage of plan.stages) {
        const stageId = getStageId(releaseId, planStage.order);
        const stage = getStageStorage(c.env, stageId);
        await stage.initialize({
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
  },
);

api.post(
  "/release/active/get",
  validator("json", (value, c) => {
    const body = value as {
      connectionId: string;
    };
    if (!body.connectionId) {
      return c.json(
        {
          message:
            "Missing required connection fields: connectionId is required",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const { connectionId } = c.req.valid("json");
      const releaseHistory = getReleaseHistory(
        c.env,
        connectionId,
      );
      const activeRelease = await releaseHistory.getActiveRelease();

      // Always return 200 OK - null when no active release, release object when active
      return c.json(activeRelease ?? null, 200);
    } catch (error) {
      console.error("Error getting active release:", error);
      return c.json({ message: "Internal Server Error", ok: false }, 500);
    }
  },
);

api.post(
  "/release/active",
  validator("json", (value, c) => {
    const body = value as {
      accountId: string;
      workerName: string;
      apiToken: string;
      command: string;
      connectionId: string;
    };
    if (!body.accountId || !body.workerName || !body.apiToken) {
      return c.json(
        {
          message:
            "Missing required connection fields: accountId, workerName, and apiToken are required",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const {
        accountId,
        workerName,
        apiToken,
        command,
        connectionId,
      } = c.req.valid("json");
      const releaseHistory = getReleaseHistory(
        c.env,
        connectionId,
      );
      const activeRelease = await releaseHistory.getActiveRelease();

      if (!activeRelease) {
        return c.json({ message: "No active release found", ok: false }, 404);
      }

      if (!command || (command !== "start" && command !== "stop")) {
        return c.json(
          { message: "Invalid command: must be 'start' or 'stop'", ok: false },
          400,
        );
      }

      const activeReleaseId = activeRelease.id;

      if (command === "start") {
        // Only allow starting if release is in not_started state
        if (activeRelease.state !== "not_started") {
          return c.json(
            {
              message: `Cannot start release in '${activeRelease.state}' state`,
              ok: false,
            },
            400,
          );
        }

        const releaseWorkflow = await c.env.RELEASE_WORKFLOW.create({
          id: activeReleaseId,
          params: {
            releaseId: activeReleaseId,
            accountId: accountId,
            workerName: workerName,
            apiToken: apiToken,
            connectionId: connectionId,
          },
        });

        await releaseHistory.updateReleaseState(activeReleaseId, "running");

        releaseWorkflow.sendEvent({ type: "release-start", payload: null });

        return c.text("Release started successfully", 200);
      } else if (command === "stop") {
        // Only allow stopping if release is in running state
        if (activeRelease.state !== "running") {
          return c.json(
            {
              message: `Cannot stop release in '${activeRelease.state}' state`,
              ok: false,
            },
            400,
          );
        }

        // This acts as a signal in the workflow to stop the release
        // It would probably be better to terminate the workflow and have
        // Cleanup logic up here. However, terminate is throwing a
        // Not Implemented error
        await releaseHistory.updateReleaseState(
          activeRelease.id,
          "done_stopped_manually",
        );

        // Deny any awaiting stages
        for (const stageRef of activeRelease.stages) {
          const stageId = getStageId(activeRelease.id, stageRef.order);
          const releaseWorkflow = await c.env.RELEASE_WORKFLOW.get(
            activeRelease.id,
          );
          await releaseWorkflow.sendEvent({
            type: `${stageId}-user-progress-command`,
            payload: "deny",
          });
        }

        return c.text("Release stopping async", 200);
      }
    } catch (error) {
      console.error("Error controlling active release:", error);
      return c.json({ message: "Internal Server Error", ok: false }, 500);
    }
  },
);

api.delete(
  "/release/active",
  validator("json", (value, c) => {
    const body = value as {
      connectionId: string;
    };
    if (!body.connectionId) {
      return c.json(
        {
          message:
            "Missing required field: connectionId is required",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const { connectionId } = c.req.valid("json");
      const releaseHistory = getReleaseHistory(
        c.env,
        connectionId,
      );
      const activeRelease = await releaseHistory.getActiveRelease();

      if (!activeRelease) {
        return c.json({ message: "No active release found", ok: false }, 404);
      }

      if (activeRelease.state !== "not_started") {
        return c.json(
          {
            message: 'Release has to be in a "not_started" state',
            ok: false,
          },
          409,
        );
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
  },
);

api.post(
  "/release/:releaseId",
  validator("json", (value, c) => {
    const body = value as {
      connectionId: string;
    };
    if (!body.connectionId) {
      return c.json(
        {
          message:
            "Missing required field: connectionId is required",
          ok: false,
        },
        400,
      );
    }
    return body;
  }),
  async (c) => {
    try {
      const releaseId = c.req.param("releaseId");
      if (!isValidId(releaseId)) {
        return c.json({ message: "Release not found", ok: false }, 404);
      }

      const { connectionId } = c.req.valid("json");
      const releaseHistory = getReleaseHistory(
        c.env,
        connectionId,
      );
      const release = await releaseHistory.getRelease(releaseId);

      if (!release) {
        return c.json({ message: "Release not found", ok: false }, 404);
      }

      return c.json(release, 200);
    } catch (error) {
      console.error("Error getting release:", error);
      return c.json({ message: "Internal Server Error", ok: false }, 500);
    }
  },
);

api.get("/stage/:stageId", async (c) => {
  try {
    const stageId = c.req.param("stageId");

    if (!isValidStageId(stageId)) {
      return c.json({ message: "Stage not found", ok: false }, 404);
    }

    const stage = getStageStorage(c.env, stageId);
    const stageData = await stage.get();

    if (!stageData) {
      return c.json({ message: "Stage not found", ok: false }, 404);
    }

    return c.json(stageData, 200);
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
      return c.json(
        { message: "Invalid command: must be 'approve' or 'deny'", ok: false },
        400,
      );
    }

    const stage = getStageStorage(c.env, stageId);
    await stage.progressStage(command);

    const releaseId = (await stage.get())?.releaseId;
    if (!releaseId) {
      return c.json({ message: "Stage not found", ok: false }, 404);
    }
    const releaseWorkflow = await c.env.RELEASE_WORKFLOW.get(releaseId);
    await releaseWorkflow.sendEvent({
      type: `${stageId}-user-progress-command`,
      payload: command,
    });

    return c.text("Stage progressed successfully", 200);
  } catch (error) {
    console.error("Error progressing stage:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

// Worker versions proxy route
api.post(
  "/worker/versions",
  validator("json", (value, c) => {
    if (!value || typeof value !== "object") {
      return c.json({ message: "Invalid request body", ok: false }, 400);
    }

    const { worker_name, account_id, api_token } = value as Record<
      string,
      unknown
    >;

    if (!worker_name || typeof worker_name !== "string") {
      return c.json(
        { message: "worker_name is required and must be a string", ok: false },
        400,
      );
    }

    if (!account_id || typeof account_id !== "string") {
      return c.json(
        { message: "account_id is required and must be a string", ok: false },
        400,
      );
    }

    if (!api_token || typeof api_token !== "string") {
      return c.json(
        { message: "api_token is required and must be a string", ok: false },
        400,
      );
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
      const response = await client.workers.scripts.versions.list(worker_name, {
        account_id: account_id,
      });

      if (response.result?.items) {
        // Return the versions in the expected format
        return c.json({
          success: true,
          result: response.result.items.slice(0, 5), // Return only the 5 most recent
        });
      } else {
        return c.json(
          {
            message: "No worker versions found. Please check your worker name.",
            ok: false,
          },
          404,
        );
      }
    } catch (error: any) {
      console.error("Error fetching worker versions:", error);

      // Handle specific Cloudflare API errors
      if (
        error.status === 401 ||
        error.message?.includes("401") ||
        error.message?.includes("Unauthorized")
      ) {
        return c.json(
          {
            message:
              "Invalid API token. Please check your token and try again.",
            ok: false,
          },
          401,
        );
      } else if (
        error.status === 403 ||
        error.message?.includes("403") ||
        error.message?.includes("Forbidden")
      ) {
        return c.json(
          {
            message:
              "Access denied. Please check your account ID and token permissions.",
            ok: false,
          },
          403,
        );
      } else if (
        error.status === 404 ||
        error.message?.includes("404") ||
        error.message?.includes("Not Found")
      ) {
        return c.json(
          {
            message:
              "Worker not found. Please check your worker name and account ID.",
            ok: false,
          },
          404,
        );
      } else {
        return c.json(
          {
            message: `Failed to fetch worker versions: ${error.message || "Unknown error"}`,
            ok: false,
          },
          500,
        );
      }
    }
  },
);

// Worker deployments proxy route
api.post(
  "/worker/deployments",
  validator("json", (value, c) => {
    if (!value || typeof value !== "object") {
      return c.json({ message: "Invalid request body", ok: false }, 400);
    }

    const { worker_name, account_id, api_token } = value as Record<
      string,
      unknown
    >;

    if (!worker_name || typeof worker_name !== "string") {
      return c.json(
        { message: "worker_name is required and must be a string", ok: false },
        400,
      );
    }

    if (!account_id || typeof account_id !== "string") {
      return c.json(
        { message: "account_id is required and must be a string", ok: false },
        400,
      );
    }

    if (!api_token || typeof api_token !== "string") {
      return c.json(
        { message: "api_token is required and must be a string", ok: false },
        400,
      );
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
        },
      );

      if (response) {
        // The deployment API returns data directly, wrap it in our expected format
        // Convert single deployment response to array format for consistency
        const deployments = Array.isArray(response) ? response : [response];
        return c.json({
          success: true,
          result: deployments,
        });
      } else {
        return c.json(
          {
            message:
              "No worker deployments found. Please check your worker name.",
            ok: false,
          },
          404,
        );
      }
    } catch (error: any) {
      console.error("Error fetching worker deployments:", error);

      // Handle specific Cloudflare API errors
      if (
        error.status === 401 ||
        error.message?.includes("401") ||
        error.message?.includes("Unauthorized")
      ) {
        return c.json(
          {
            message:
              "Invalid API token. Please check your token and try again.",
            ok: false,
          },
          401,
        );
      } else if (
        error.status === 403 ||
        error.message?.includes("403") ||
        error.message?.includes("Forbidden")
      ) {
        return c.json(
          {
            message:
              "Access denied. Please check your account ID and token permissions.",
            ok: false,
          },
          403,
        );
      } else if (
        error.status === 404 ||
        error.message?.includes("404") ||
        error.message?.includes("Not Found")
      ) {
        return c.json(
          {
            message:
              "Worker not found. Please check your worker name and account ID.",
            ok: false,
          },
          404,
        );
      } else {
        return c.json(
          {
            message: `Failed to fetch worker deployments: ${error.message || "Unknown error"}`,
            ok: false,
          },
          500,
        );
      }
    }
  },
);

app.route("/api", api);

export { PlanStorage, ReleaseHistory, StageStorage, ReleaseWorkflow };
export default app;
