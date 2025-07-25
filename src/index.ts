import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { validator } from "hono/validator";
import type { components } from "../types/api";

function isValidId(value: string): boolean {
  return value.match(/^[0-9a-fA-F]{32}$/g) !== null;
}

const app = new Hono<{ Bindings: Cloudflare.Env }>();
app.use(prettyJSON());
app.notFound((c) => c.json({ message: "Not Found", ok: false }, 404));
app.get("/docs/api", async (c) =>
  c.env.ASSETS.fetch("https://assets.local/docs/openapi.html"),
);

const api = new Hono<{ Bindings: Cloudflare.Env }>();

api.get("/plan", async (c) => {
  try {
    // TODO: Implement actual data retrieval
    const mockPlan: components["schemas"]["Plan"] = {
      stages: [
        {
          order: 0,
          target_percent: 25,
          soak_time: 10,
          auto_progress: true,
        },
        {
          order: 1,
          target_percent: 50,
          soak_time: 15,
          auto_progress: false,
        },
      ],
      slos: [
        { value: "latency p99 100" },
      ],
    };
    
    return c.json(mockPlan, 200);
  } catch (error) {
    console.error("Error getting plan:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/plan", validator("json", (value, c) => {
  const plan = value as components["schemas"]["Plan"];
  if (!plan.stages || !Array.isArray(plan.stages) || !plan.slos || !Array.isArray(plan.slos)) {
    return c.json({ message: "Invalid plan: must include stages and slos arrays", ok: false }, 400);
  }
  return plan;
}), async (c) => {
  try {
    const plan = c.req.valid("json");
    // TODO: Implement actual plan update
    
    return c.json(plan, 200);
  } catch (error) {
    console.error("Error updating plan:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release", async (c) => {
  try {
    // TODO: Implement actual data retrieval
    const mockReleases: components["schemas"]["Release"][] = [
      {
        id: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        state: "not_started",
        plan_record: {
          stages: [
            {
              order: 0,
              target_percent: 25,
              soak_time: 10,
              auto_progress: true,
            },
          ],
          slos: [
            { value: "latency p99 100" },
          ],
        },
        stages: [
          {
            id: "b2a2c3d4e5f6a1b2d3d5e5f6a1b2c3d5",
            order: 0,
            state: "queued",
            time_started: "2023-01-01T00:00:00Z",
            time_elapsed: 0,
          },
        ],
        time_started: "2023-01-01T00:00:00Z",
        time_elapsed: 0,
      },
    ];
    
    return c.json(mockReleases, 200);
  } catch (error) {
    console.error("Error getting releases:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/release", validator("json", (value, c) => {
  const release = value as components["schemas"]["Release"];
  if (!release.id || !release.plan_record) {
    return c.json({ message: "Invalid release: must include id and plan_record", ok: false }, 400);
  }
  return release;
}), async (c) => {
  try {
    const release = c.req.valid("json");
    // TODO: Implement actual release creation
    
    // Check if there's already a staged release
    const alreadyStaged = false; // TODO: Implement actual check
    if (alreadyStaged) {
      return c.json({ message: "A release is already staged", ok: false }, 409);
    }
    
    return c.json(release, 200);
  } catch (error) {
    console.error("Error creating release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.get("/release/:releaseId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    if (!isValidId(releaseId)) {
      return c.json({ message: "Invalid release ID format", ok: false }, 400);
    }
    
    // TODO: Implement actual data retrieval
    const mockRelease: components["schemas"]["Release"] = {
      id: releaseId,
      state: "not_started",
      plan_record: {
        stages: [
          {
            order: 0,
            target_percent: 25,
            soak_time: 10,
            auto_progress: true,
          },
        ],
        slos: [
          { value: "latency p99 100" },
        ],
      },
      stages: [
        {
          id: "b2a2c3d4e5f6a1b2d3d5e5f6a1b2c3d5",
          order: 0,
          state: "queued",
          time_started: "2023-01-01T00:00:00Z",
          time_elapsed: 0,
        },
      ],
      time_started: "2023-01-01T00:00:00Z",
      time_elapsed: 0,
    };
    
    return c.json(mockRelease, 200);
  } catch (error) {
    console.error("Error getting release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.post("/release/:releaseId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    if (!isValidId(releaseId)) {
      return c.json({ message: "Invalid release ID format", ok: false }, 400);
    }
    
    // According to the OpenAPI spec, the content type should be application/text
    const command = await c.req.text();
    
    if (command !== "start" && command !== "abort") {
      return c.json({ message: "Invalid command: must be 'start' or 'abort'", ok: false }, 400);
    }
    
    // TODO: Implement actual release control logic
    
    return c.text("Command executed successfully", 200);
  } catch (error) {
    console.error("Error controlling release:", error);
    return c.json({ message: "Internal Server Error", ok: false }, 500);
  }
});

api.delete("/release/:releaseId", async (c) => {
  try {
    const releaseId = c.req.param("releaseId");
    if (!isValidId(releaseId)) {
      return c.json({ message: "Invalid release ID format", ok: false }, 400);
    }
    
    // TODO: Implement actual release deletion logic
    // For now, always succeed
    
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
      return c.json({ message: "Invalid release ID format", ok: false }, 400);
    }
    
    // TODO: Implement actual stage data retrieval
    const mockStage: components["schemas"]["ReleaseStage"] = {
      id: releaseStageId,
      order: 0,
      state: "queued",
      time_started: "2023-01-01T00:00:00Z",
      time_elapsed: 0,
    };
    
    return c.json(mockStage, 200);
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
      return c.json({ message: "Invalid release ID format", ok: false }, 400);
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

export default app;
