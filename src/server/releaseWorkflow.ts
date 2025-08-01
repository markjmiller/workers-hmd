import {
  WorkflowEntrypoint,
  WorkflowStep,
  WorkflowEvent,
} from "cloudflare:workers";
import { Cloudflare as cf } from "cloudflare";
import { components } from "../../types/api";
import { StageStorage } from "./stage";
import { ReleaseHistory } from "./releaseHistory";
import { SLOEvaluator } from "./sloEvaluator";
import { v4 as uuidv4 } from "uuid";
import { PlanStorage } from "./plan";

type StageRef = components["schemas"]["StageRef"];
type PlanStage = components["schemas"]["PlanStage"];
type Release = components["schemas"]["Release"];

/**
 * Get ReleaseHistory Durable Object stub with account-specific ID
 */
export function getReleaseHistory(
  env: Cloudflare.Env,
  accountSpecificId: string,
): DurableObjectStub<ReleaseHistory> {
  return env.RELEASE_HISTORY.get(env.RELEASE_HISTORY.idFromName(accountSpecificId));
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

export type ReleaseWorkflowParams = {
  releaseId: string;
  accountId: string;
  workerName: string;
  apiToken: string;
  connectionId: string;
};

export class ReleaseWorkflow extends WorkflowEntrypoint<
  Cloudflare.Env,
  ReleaseWorkflowParams
> {
  private connectionId: string = "";
  private accountId: string = "";
  private workerName: string = "";

  private getStageStorage(releaseId: string, stageOrder: number) {
    return this.env.STAGE_STORAGE.get(
      this.env.STAGE_STORAGE.idFromName(
        `release-${releaseId}-order-${stageOrder}`,
      ),
    );
  }

  private async updateStagesStateBad(
    releaseId: string,
    stages: any[],
    state: "done_cancelled" | "done_failed" | "error",
    excludeCompleted = true,
  ) {
    for (const planStage of stages) {
      const stage = this.getStageStorage(releaseId, planStage.order);
      const currentStageData = await stage.get();

      if (
        currentStageData &&
        (!excludeCompleted || !currentStageData.state.startsWith("done_"))
      ) {
        await stage.updateStageState(state);
        console.log(`🚫 Set stage ${planStage.order} to ${state}`);
      }
    }
  }

  private client: cf | undefined;

  async run(
    event: WorkflowEvent<ReleaseWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const { releaseId, accountId, workerName, apiToken, connectionId } =
      event.payload;

    this.connectionId = connectionId;
    this.accountId = accountId;
    this.workerName = workerName;
    const releaseHistory = getReleaseHistory(
      this.env,
      connectionId,
    );

    let release: Release | undefined;

    try {
      release = await releaseHistory.getRelease(releaseId);

      if (!release) {
        console.error(`❌ Release ${releaseId} not found!`);
        return;
      }

      this.client = new cf({
        apiToken: apiToken,
      });

      this.accountId = accountId;

      console.log(`
🚀 Starting release: ${releaseId}
----------
Worker Name: ${release.plan_record.worker_name}
Account ID: ${this.accountId}
----------
      `);

      await step.do("update release state to running", async () => {
        await releaseHistory.updateReleaseState(releaseId, "running");
      });

      await this.processStages(event, step, release, releaseHistory);

      await step.do("complete release", async () => {
        // Note: always get the release by id because it might not be active anymore
        const specificRelease = await releaseHistory.getRelease(releaseId);

        if (specificRelease?.state === "done_stopped_manually") {
          console.log(
            `🛑 Release ${releaseId} was cancelled - reverting deployment`,
          );
          await this.revertDeployment(releaseId, release!.old_version);
        } else if (specificRelease?.state === "done_failed_slo") {
          console.log(
            `💥 Release ${releaseId} failed SLO - reverting deployment`,
          );
          await this.revertDeployment(releaseId, release!.old_version);
        } else {
          // Release completed successfully
          await releaseHistory.updateReleaseState(releaseId, "done_successful");
          console.log(`🎉 Release ${releaseId} completed successfully`);
          await this.finishDeployment(releaseId, release!.new_version);
        }
      });
    } catch (error) {
      console.error(`💥 Workflow error for release ${releaseId}:`, error);

      await step.do("handle workflow error and revert deployment", async () => {
        // Handle workflow error inline to ensure state changes are in workflow step
        const releaseHistory = getReleaseHistory(
          this.env,
          this.connectionId,
        );
        const currentRelease = await releaseHistory.getRelease(releaseId);

        if (currentRelease) {
          await this.updateStagesStateBad(
            releaseId,
            currentRelease.plan_record.stages,
            "done_cancelled",
            true,
          );
          await releaseHistory.updateReleaseState(releaseId, "error");
        }

        if (release) {
          await this.revertDeployment(
            releaseId,
            release.old_version,
          );
        }
      });

      throw error;
    }
  }

  private async processStages(
    event: WorkflowEvent<ReleaseWorkflowParams>,
    step: WorkflowStep,
    release: Release,
    releaseHistory: DurableObjectStub<ReleaseHistory>,
  ) {
    const { releaseId } = event.payload;

    const updateRemainingStages = async (
      failureState: "done_cancelled" | "done_failed",
      currentStageOrder: number,
    ) => {
      const remainingStages = release.plan_record.stages.filter(
        (s: PlanStage) => s.order > currentStageOrder,
      );
      console.log(
        `🔍 Found ${remainingStages.length} remaining stages to update after stage ${currentStageOrder}`,
      );
      await this.updateStagesStateBad(releaseId, remainingStages, failureState);
    };

    for (const stageRef of release.stages) {
      const stagePlan = release.plan_record.stages.find(
        (s: PlanStage) => s.order === stageRef.order,
      );
      if (!stagePlan) {
        console.error(`❌ No plan found for stage ${stageRef.id}`);
        continue;
      }

      console.log(
        `🎬 Starting stage ${stageRef.order}: ${stagePlan.soak_time}s soak`,
      );
      const stage = this.env.STAGE_STORAGE.get(
        this.env.STAGE_STORAGE.idFromName(stageRef.id),
      );

      await step.do(`${stageRef.id} - start`, async () => {
        await stage.updateStageState("running");
        await this.setDeploymentTarget(
          releaseId,
          stagePlan.target_percent,
          release.old_version,
          release.new_version,
        );
      });

      const soakResult = await this.processStageSoak(
        releaseId,
        step,
        stageRef,
        stagePlan,
      );
      if (soakResult === "exit") {
        console.log(
          `🛑 Stage ${stageRef.order} soak failed - exiting workflow`,
        );
        return;
      }
      console.log(`🛁 Stage ${stageRef.order} soak completed`);

      const shouldWaitForApproval = await this.handleStageApproval(
        step,
        stageRef,
        stagePlan,
        release,
        stage,
        updateRemainingStages,
        releaseHistory,
        releaseId,
      );
      if (shouldWaitForApproval === "exit") return;

      await step.do(`${stageRef.id} - done`, async () => {
        await stage.updateStageState("done_successful");
        console.log(`✅ Stage ${stageRef.order} completed`);
      });
    }
  }

  private async handleExternalCancellation(
    step: WorkflowStep,
    releaseId: string,
    currentStageOrder: number,
  ) {
    await step.do("handle external cancellation", async () => {
      const releaseHistory = getReleaseHistory(
        this.env,
        this.connectionId,
      );
      const release = await releaseHistory.getRelease(releaseId);

      if (release) {
        // Update all non-completed stages to cancelled state
        const remainingStages = release.plan_record.stages.filter(
          (s: PlanStage) => s.order >= currentStageOrder,
        );
        await this.updateStagesStateBad(
          releaseId,
          remainingStages,
          "done_cancelled",
          true,
        );

        // Update release state to done_stopped_manually
        await releaseHistory.updateReleaseState(
          releaseId,
          "done_stopped_manually",
        );

        // Revert deployment to old version
        await this.revertDeployment(releaseId, release.old_version);

        console.log(
          `🛑 External cancellation handled - updated ${remainingStages.length} stages to cancelled, reverted deployment, and set release to stopped`,
        );
      }
    });
  }

  private async handleSLOViolation(
    step: WorkflowStep,
    releaseId: string,
    currentStageOrder: number,
    currentStageId: string,
  ) {
    await step.do("handle SLO violation", async () => {
      const releaseHistory = getReleaseHistory(
        this.env,
        this.connectionId,
      );
      const release = await releaseHistory.getRelease(releaseId);

      if (release) {
        // First, explicitly mark the current stage as failed
        const stage = this.env.STAGE_STORAGE.get(
          this.env.STAGE_STORAGE.idFromName(currentStageId),
        );
        await stage.updateStageState("done_failed");

        // Update all remaining stages (after current) to cancelled state
        const remainingStages = release.plan_record.stages.filter(
          (s: PlanStage) => s.order > currentStageOrder,
        );
        await this.updateStagesStateBad(
          releaseId,
          remainingStages,
          "done_cancelled",
          true,
        );

        // Update release state to done_failed_slo
        await releaseHistory.updateReleaseState(releaseId, "done_failed_slo");

        console.log(
          `💥 SLO violation handled - current stage and ${remainingStages.length} remaining stages marked as failed, release set to SLO failed`,
        );
      }
    });
  }

  private async processStageSoak(
    releaseId: string,
    step: WorkflowStep,
    stageRef: StageRef,
    stagePlan: PlanStage,
  ): Promise<"continue" | "exit"> {
    // Get release to access plan polling configuration
    const releaseHistory = getReleaseHistory(
      this.env,
      this.connectionId,
    );
    const release = await releaseHistory.getRelease(releaseId);

    // Calculate interval time based on plan-level polling_fraction
    const pollingFraction = release?.plan_record?.polling_fraction || 0.5;
    const intervalTimeSeconds = Math.max(
      1,
      Math.floor(stagePlan.soak_time * pollingFraction),
    );

    for (
      let i = 0;
      i < Math.floor(stagePlan.soak_time / intervalTimeSeconds);
      i++
    ) {
      // Check for cancellation every 1 second within this interval
      for (let j = 0; j < intervalTimeSeconds; j++) {
        // Check if release was stopped
        const releaseHistory = getReleaseHistory(
          this.env,
          this.connectionId,
        );
        const release = await releaseHistory.getRelease(releaseId);
        if (release?.state !== "running") {
          await this.handleExternalCancellation(
            step,
            release?.id || "",
            stageRef.order,
          );
          return "exit";
        }
        await step.sleep(`${stageRef.id} - check cancellation`, "1 seconds");
      }
      console.log(`🛁 Stage ${stageRef.order} soak - Checking SLOs`);
      const wallTimes = await this.getWallTimes(
        Date.now() - intervalTimeSeconds * 1000,
        Date.now(),
      );
      // Set observation window to 1 hour for testing
      // const wallTimes = await this.getWallTimes(workerName, Date.now() - 60 * 60 * 1000000, Date.now());
      console.log(`
=== Observability ===
P999 Wall: ${wallTimes.p999}
P99 Wall: ${wallTimes.p99}
P90 Wall: ${wallTimes.p90}
P50 Wall: ${wallTimes.median}
=====================
      `);

      // Get SLO configurations from the release plan
      const sloConfigs = SLOEvaluator.parseSLOsFromPlan(
        release!.plan_record.slos,
      );

      if (sloConfigs.length > 0) {
        // Evaluate SLOs using the new evaluator
        const sloResult = SLOEvaluator.evaluateSLOs(sloConfigs, wallTimes);

        console.log(`📊 SLO Evaluation: ${sloResult.summary}`);

        if (!sloResult.passed) {
          console.log(
            `🛑 Stage ${stageRef.order} soak failed - SLO violations: ${sloResult.violations.map((v) => `${v.percentile} ${v.actual_ms}ms > ${v.expected_max_ms}ms`).join(", ")}`,
          );
          const stage = this.env.STAGE_STORAGE.get(
            this.env.STAGE_STORAGE.idFromName(stageRef.id),
          );
          await stage.addLog(
            `🛑 SLO violations: ${sloResult.violations.map((v) => `${v.percentile} ${v.actual_ms}ms > ${v.expected_max_ms}ms`).join(", ")}`,
          );
          await this.handleSLOViolation(
            step,
            release?.id || "",
            stageRef.order,
            stageRef.id,
          );

          return "exit";
        }

        console.log(
          `✅ Stage ${stageRef.order} soak passed - All SLOs satisfied`,
        );
      } else {
        console.log(
          `⚠️  Stage ${stageRef.order} soak - No SLOs configured, skipping SLO check`,
        );
      }
    }
    return "continue";
  }

  private async handleStageApproval(
    step: WorkflowStep,
    stageRef: StageRef,
    stagePlan: PlanStage,
    release: Release,
    stage: DurableObjectStub<StageStorage>,
    updateRemainingStages: (
      state: "done_cancelled" | "done_failed",
      order: number,
    ) => Promise<void>,
    releaseHistory: DurableObjectStub<ReleaseHistory>,
    releaseId: string,
  ): Promise<"continue" | "exit"> {
    const isLastStage =
      stageRef.order ===
      Math.max(...release.plan_record.stages.map((s: PlanStage) => s.order));

    if (!stagePlan.auto_progress && !isLastStage) {
      await step.do(`${stageRef.id} - set awaiting approval`, async () => {
        await stage.updateStageState("awaiting_approval");
      });
      console.log(`⏳ Stage ${stageRef.order} awaiting approval`);

      // Check if release has been stopped
      const currentRelease = await releaseHistory.getRelease(releaseId);
      if (!currentRelease || currentRelease.state !== "running") {
        console.log(`🛑 Release ${releaseId} was stopped during approval wait`);
        await this.handleExternalCancellation(step, releaseId, stageRef.order);
        return "exit";
      }

      const waitForApproval = await step.waitForEvent(
        `Waiting for stage ${stageRef.id} approval`,
        {
          type: `${stageRef.id}-user-progress-command`,
        },
      );

      if (waitForApproval.payload === "approve") {
        console.log(`✔️ Stage ${stageRef.order} approved`);
        return "continue";
      } else if (waitForApproval.payload === "deny") {
        console.log(`❌ Stage ${stageRef.order} denied - stopping release`);

        await step.do(
          `Cancel stage ${stageRef.id} and remaining stages`,
          async () => {
            await stage.updateStageState("done_cancelled");
            await updateRemainingStages("done_cancelled", stageRef.order);
            await releaseHistory.updateReleaseState(
              releaseId,
              "done_stopped_manually",
            );
            console.log(`🛑 Release stopped - stage ${stageRef.order} denied`);
            // Revert deployment when release is manually cancelled
            await this.revertDeployment(releaseId, release.old_version);
          },
        );

        return "exit";
      }
    }

    return "continue";
  }

  private async setDeploymentTarget(
    releaseId: string,
    target_percent: number,
    old_version_id: string,
    new_version_id: string,
  ) {
    console.log(`
=== CF DEPLOYMENT API REQUEST ===
Account: ${this.accountId}
Worker: ${this.workerName}
Old Version: ${old_version_id} (${100 - target_percent}%)
New Version: ${new_version_id} (${target_percent}%)
================================
    `);
    await this.client!.workers.scripts.deployments.create(this.workerName, {
      account_id: this.accountId!,
      strategy: "percentage",
      versions: [
        {
          percentage: target_percent,
          version_id: new_version_id,
        },
        {
          percentage: 100 - target_percent,
          version_id: old_version_id,
        },
      ],
      annotations: {
        "workers/message": `Workers HMD Release ${releaseId} - in progress`,
      },
    });
  }

  private async finishDeployment(
    releaseId: string,
    new_version_id: string,
  ) {
    console.log(`
=== CF DEPLOYMENT API REQUEST ===
Account: ${this.accountId}
Worker: ${this.workerName}
Finishing deployment with new version: ${new_version_id}
================================
    `);
    await this.client!.workers.scripts.deployments.create(this.workerName, {
      account_id: this.accountId!,
      strategy: "percentage",
      versions: [
        {
          percentage: 100,
          version_id: new_version_id,
        },
      ],
      annotations: {
        "workers/message": `Workers HMD Release ${releaseId} - complete`,
      },
    });
  }

  private async revertDeployment(
    releaseId: string,
    old_version_id: string,
  ) {
    console.log(`
=== CF DEPLOYMENT API REQUEST ===
Account: ${this.accountId}
Worker: ${this.workerName}
Reverting to old version: ${old_version_id}
================================
    `);
    await this.client!.workers.scripts.deployments.create(this.workerName, {
      account_id: this.accountId!,
      strategy: "percentage",
      versions: [
        {
          percentage: 100,
          version_id: old_version_id,
        },
      ],
      annotations: {
        "workers/message": `Workers HMD Release ${releaseId} - reverted`,
      },
    });
  }

  private async getWallTimes(
    from: number,
    to: number,
  ): Promise<{ p999: number; p99: number; p90: number; median: number }> {
    try {
      // TODO replace with client.workers.observability.telemetry.query
      const apiToken = this.client!.apiToken;
      const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId!}/workers/observability/telemetry/query`;

      const requestBody = {
        view: "calculations",
        limit: 10,
        dry: false,
        queryId: "workers-logs",
        parameters: {
          datasets: ["cloudflare-workers"],
          filters: [
            {
              key: "$workers.scriptName",
              operation: "eq",
              value: this.workerName,
              type: "string",
              id: uuidv4(),
            },
          ],
          calculations: [
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "p999",
              alias: "P999 Wall",
              id: uuidv4(),
            },
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "p99",
              alias: "P99 Wall",
              id: uuidv4(),
            },
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "p90",
              alias: "P90 Wall",
              id: uuidv4(),
            },
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "median",
              alias: "P50 Wall",
              id: uuidv4(),
            },
          ],
          groupBys: [],
          havings: [],
        },
        timeframe: {
          from,
          to,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(
          `Observability API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const responseData = (await response.json()) as any;

      // Extract the percentile values from the response
      const calculations = responseData.result?.calculations || [];

      // Find the calculation results from aggregates
      let p999 = 0,
        p99 = 0,
        p90 = 0,
        median = 0;

      for (const calculation of calculations) {
        if (
          calculation.alias === "P999 Wall" &&
          calculation.aggregates?.length > 0
        ) {
          p999 = calculation.aggregates[0].value;
        } else if (
          calculation.alias === "P99 Wall" &&
          calculation.aggregates?.length > 0
        ) {
          p99 = calculation.aggregates[0].value;
        } else if (
          calculation.alias === "P90 Wall" &&
          calculation.aggregates?.length > 0
        ) {
          p90 = calculation.aggregates[0].value;
        } else if (
          calculation.alias === "P50 Wall" &&
          calculation.aggregates?.length > 0
        ) {
          median = calculation.aggregates[0].value;
        }
      }

      return {
        p999,
        p99,
        p90,
        median,
      };
    } catch (error) {
      console.error(
        "Failed to fetch wall times from observability API:",
        error,
      );
      throw error;
    }
  }
}
