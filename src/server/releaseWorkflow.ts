import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Cloudflare as cf } from 'cloudflare';
import { components } from '../../types/api';
import { ReleaseHistory } from './releaseHistory';
import { StageStorage } from './stage';
import { v4 as uuidv4 } from 'uuid';

type StageId = components["schemas"]["StageId"];
type PlanStage = components["schemas"]["PlanStage"];
type Release = components["schemas"]["Release"];

export type ReleaseWorkflowParams = {
  releaseId: string;
  accountId: string;
  apiToken: string;
};

export class ReleaseWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ReleaseWorkflowParams> {
  private getReleaseHistory() {
    return this.env.RELEASE_HISTORY.get(this.env.RELEASE_HISTORY.idFromName("main"));
  }

  private getStageStorage(releaseId: string, stageOrder: number) {
    return this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(`release-${releaseId}-order-${stageOrder}`));
  }

  private async updateStagesState(releaseId: string, stages: any[], state: "done_cancelled" | "done_failed", excludeCompleted = true) {
    for (const planStage of stages) {
      const stageStorage = this.getStageStorage(releaseId, planStage.order);
      const currentStageData = await stageStorage.get();
      
      if (currentStageData && (!excludeCompleted || !currentStageData.state.startsWith('done_'))) {
        await stageStorage.updateStageState(state);
        console.log(`🚫 Set stage ${planStage.order} to ${state}`);
      }
    }
  }

  private client: cf | undefined;
  private accountId: string | undefined;

  async run(event: WorkflowEvent<ReleaseWorkflowParams>, step: WorkflowStep): Promise<void> {
    const { releaseId, accountId, apiToken } = event.payload;
    const releaseHistory = this.env.RELEASE_HISTORY.get(this.env.RELEASE_HISTORY.idFromName("main"));
    
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
        
        if (specificRelease?.state === 'done_stopped_manually') {
          console.log(`🛑 Release ${releaseId} was cancelled - reverting deployment`);
          await this.revertDeployment(releaseId, release!.plan_record.worker_name, release!.old_version);
        } else if (specificRelease?.state === 'done_failed_slo') {
          console.log(`💥 Release ${releaseId} failed SLO - reverting deployment`);
          await this.revertDeployment(releaseId, release!.plan_record.worker_name, release!.old_version);
        } else {
          // Release completed successfully
          await releaseHistory.updateReleaseState(releaseId, "done_successful");
          console.log(`🎉 Release ${releaseId} completed successfully`);
          await this.finishDeployment(releaseId, release!.plan_record.worker_name, release!.new_version);
        }
      });

    } catch (error) {
      console.error(`💥 Workflow error for release ${releaseId}:`, error);
      
      await step.do("handle workflow error and revert deployment", async () => {
        // Handle workflow error inline to ensure state changes are in workflow step
        const releaseHistory = this.getReleaseHistory();
        const currentRelease = await releaseHistory.getRelease(releaseId);
        
        if (currentRelease) {
          await this.updateStagesState(releaseId, currentRelease.plan_record.stages, "done_failed", true);
          await releaseHistory.updateReleaseState(releaseId, "done_failed_slo");
        }
        
        if (release) {
          await this.revertDeployment(releaseId, release.plan_record.worker_name, release.old_version);
        }
      });
      
      throw error;
    }
  }

  private async processStages(event: WorkflowEvent<ReleaseWorkflowParams>, step: WorkflowStep, release: Release, releaseHistory: DurableObjectStub<ReleaseHistory>) {
    const { releaseId } = event.payload;
    
    const updateRemainingStages = async (failureState: "done_cancelled" | "done_failed", currentStageOrder: number) => {
      const remainingStages = release.plan_record.stages.filter((s: PlanStage) => s.order > currentStageOrder);
      console.log(`🔍 Found ${remainingStages.length} remaining stages to update after stage ${currentStageOrder}`);
      await this.updateStagesState(releaseId, remainingStages, failureState);
    };

    for (const stage of release.stages) {
      const stagePlan = release.plan_record.stages.find((s: PlanStage) => s.order === stage.order);
      if (!stagePlan) {
        console.error(`❌ No plan found for stage ${stage.id}`);
        continue;
      }
      
      console.log(`🎬 Starting stage ${stage.order}: ${stagePlan.soak_time}s soak`);
      const stageStorage = this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(stage.id));

      await step.do(`${stage.id} - start`, async () => {
        await stageStorage.updateStageState("running");
        await this.setDeploymentTarget(releaseId, release.plan_record.worker_name, stagePlan.target_percent, release.old_version, release.new_version);
      });

      const soakResult = await this.processStageSoak(releaseId, release.plan_record.worker_name, step, stage, stagePlan);
      if (soakResult === 'exit') {
        console.log(`🛑 Stage ${stage.order} soak failed - exiting workflow`);
        return;
      }
      console.log(`🛁 Stage ${stage.order} soak completed`);

      const shouldWaitForApproval = await this.handleStageApproval(step, stage, stagePlan, release, stageStorage, updateRemainingStages, releaseHistory, releaseId);
      if (shouldWaitForApproval === 'exit') return;

      await step.do(`${stage.id} - done`, async () => {
        await stageStorage.updateStageState("done_successful");
        console.log(`✅ Stage ${stage.order} completed`);
      });
    }
  }

  private async handleExternalCancellation(step: WorkflowStep, releaseId: string, currentStageOrder: number) {
    await step.do("handle external cancellation", async () => {
      const releaseHistory = this.getReleaseHistory();
      const release = await releaseHistory.getRelease(releaseId);
      
      if (release) {
        // Update all non-completed stages to cancelled state
        const remainingStages = release.plan_record.stages.filter((s: PlanStage) => s.order >= currentStageOrder);
        await this.updateStagesState(releaseId, remainingStages, "done_cancelled", true);
        
        // Update release state to done_stopped_manually
        await releaseHistory.updateReleaseState(releaseId, "done_stopped_manually");
        
        // Revert deployment to old version
        await this.revertDeployment(releaseId, release.plan_record.worker_name, release.old_version);
        
        console.log(`🛑 External cancellation handled - updated ${remainingStages.length} stages to cancelled, reverted deployment, and set release to stopped`);
      }
    });
  }

  private async handleSLOViolation(step: WorkflowStep, releaseId: string, currentStageOrder: number, currentStageId: string) {
    await step.do("handle SLO violation", async () => {
      const releaseHistory = this.getReleaseHistory();
      const release = await releaseHistory.getRelease(releaseId);
      
      if (release) {
        // First, explicitly mark the current stage as failed
        const currentStageStorage = this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(currentStageId));
        await currentStageStorage.updateStageState("done_failed");
        
        // Update all remaining stages (after current) to cancelled state  
        const remainingStages = release.plan_record.stages.filter((s: PlanStage) => s.order > currentStageOrder);
        await this.updateStagesState(releaseId, remainingStages, "done_cancelled", true);
        
        // Update release state to done_failed_slo
        await releaseHistory.updateReleaseState(releaseId, "done_failed_slo");
        
        console.log(`💥 SLO violation handled - current stage and ${remainingStages.length} remaining stages marked as failed, release set to SLO failed`);
      }
    });
  }

  private async processStageSoak(releaseId: string, workerName: string, step: WorkflowStep, stage: StageId, stagePlan: PlanStage): Promise<'continue' | 'exit'> {
    // TODO for prod this should be 5 mins
    const intervalTimeSeconds = 10;
    for (let i = 0; i < Math.floor(stagePlan.soak_time / intervalTimeSeconds); i++) {
      // Check if release was stopped
      const releaseHistory = this.getReleaseHistory();
      const release = await releaseHistory.getRelease(releaseId);
      if (release?.state !== 'running') {
        await this.handleExternalCancellation(step, release?.id || '', stage.order);
        return 'exit';
      }
      await step.sleep(`${stage.id} - soak`, `${intervalTimeSeconds} seconds`);
      console.log(`🛁 Stage ${stage.order} soak - Checking SLOs`);
      // TODO for prod this should use:
      //const wallTimes = await this.getWallTimes(workerName, Date.now() - intervalTimeSeconds * 1000000, Date.now());
      const wallTimes = await this.getWallTimes(workerName, Date.now() - 60 * 60 * 1000000, Date.now());
      console.log(`
=== Observability ===
P999 Wall: ${wallTimes.p999}
P99 Wall: ${wallTimes.p99}
P90 Wall: ${wallTimes.p90}
P50 Wall: ${wallTimes.median}
=====================
      `);

      if (wallTimes.p999 > 1000) {
        console.log(`🛑 Stage ${stage.order} soak failed - P999 Wall time exceeded 1000ms`);
        await this.handleSLOViolation(step, release?.id || '', stage.order, stage.id);
        return 'exit';
      }
    }
    return 'continue';
  }

  private async handleStageApproval(
    step: WorkflowStep, 
    stage: StageId, 
    stagePlan: PlanStage, 
    release: Release, 
    stageStorage: DurableObjectStub<StageStorage>, 
    updateRemainingStages: (state: "done_cancelled" | "done_failed", order: number) => Promise<void>,
    releaseHistory: DurableObjectStub<ReleaseHistory>,
    releaseId: string
  ): Promise<'continue' | 'exit'> {
    const isLastStage = stage.order === Math.max(...release.plan_record.stages.map((s: PlanStage) => s.order));
    
    if (!stagePlan.auto_progress && !isLastStage) {
      await step.do(`${stage.id} - set awaiting approval`, async () => {
        await stageStorage.updateStageState("awaiting_approval");
      });
      console.log(`⏳ Stage ${stage.order} awaiting approval`);

      let waitForApproval;
      while (true) {
        // Check if release has been stopped
        const currentRelease = await releaseHistory.getRelease(releaseId);
        if (!currentRelease || currentRelease.state !== 'running') {
          console.log(`🛑 Release ${releaseId} was stopped during approval wait`);
          await this.handleExternalCancellation(step, releaseId, stage.order);
          return 'exit';
        }
        
        // Wait for approval with timeout
        waitForApproval = await step.waitForEvent(`Waiting for stage ${stage.id} approval`, {
          type: `${stage.id}-user-progress-command`,
          timeout: '5 seconds'
        });
        
        // If we got an event, break out of the loop
        if (waitForApproval !== null) {
          break;
        }
      }
      
      if (waitForApproval.payload === "approve") {
        console.log(`✔️ Stage ${stage.order} approved`);
        return 'continue';
      } else if (waitForApproval.payload === "deny") {
        console.log(`❌ Stage ${stage.order} denied - stopping release`);
        
        await step.do(`Cancel stage ${stage.id} and remaining stages`, async () => {
          await stageStorage.updateStageState("done_cancelled");
          await updateRemainingStages("done_cancelled", stage.order);
          await releaseHistory.updateReleaseState(releaseId, "done_stopped_manually");
          console.log(`🛑 Release stopped - stage ${stage.order} denied`);
          // Revert deployment when release is manually cancelled
          await this.revertDeployment(releaseId, release.plan_record.worker_name, release.old_version);
        });
        
        return 'exit';
      }
    }
    
    return 'continue';
  }



  private async setDeploymentTarget(releaseId: string, worker_name: string, target_percent: number, old_version_id: string, new_version_id: string) {
    console.log(`
=== CF DEPLOYMENT API REQUEST ===
Account: ${this.accountId}
Worker: ${worker_name}
Old Version: ${old_version_id} (${100 - target_percent}%)
New Version: ${new_version_id} (${target_percent}%)
================================
    `);
    await this.client!.workers.scripts.deployments.create(worker_name, {
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

  private async finishDeployment(releaseId: string, worker_name: string, new_version_id: string) {
    console.log(`
=== CF DEPLOYMENT API REQUEST ===
Account: ${this.accountId}
Worker: ${worker_name}
Finishing deployment with new version: ${new_version_id}
================================
    `);
    await this.client!.workers.scripts.deployments.create(worker_name, {
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

  private async revertDeployment(releaseId: string, worker_name: string, old_version_id: string) {
    console.log(`
=== CF DEPLOYMENT API REQUEST ===
Account: ${this.accountId}
Worker: ${worker_name}
Reverting to old version: ${old_version_id}
================================
    `);
    await this.client!.workers.scripts.deployments.create(worker_name, {
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

  private async getWallTimes(workerName: string, from: number, to: number): Promise<{ p999: number, p99: number, p90: number, median: number }> {
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
              value: workerName,
              type: "string",
              id: uuidv4()
            }
          ],
          calculations: [
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "p999",
              alias: "P999 Wall",
              id:   uuidv4()
            },
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "p99",
              alias: "P99 Wall",
              id: uuidv4()
            },
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "p90",
              alias: "P90 Wall",
              id: uuidv4()
            },
            {
              key: "$workers.wallTimeMs",
              keyType: "number",
              operator: "median",
              alias: "P50 Wall",
              id: uuidv4()
            }
          ],
          groupBys: [],
          havings: []
        },
        timeframe: {
          from,
          to
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Observability API request failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json() as any;
      
      // Extract the percentile values from the response
      const calculations = responseData.result?.calculations || [];
      
      // Find the calculation results from aggregates
      let p999 = 0, p99 = 0, p90 = 0, median = 0;
      
      for (const calculation of calculations) {
        if (calculation.alias === 'P999 Wall' && calculation.aggregates?.length > 0) {
          p999 = calculation.aggregates[0].value;
        } else if (calculation.alias === 'P99 Wall' && calculation.aggregates?.length > 0) {
          p99 = calculation.aggregates[0].value;
        } else if (calculation.alias === 'P90 Wall' && calculation.aggregates?.length > 0) {
          p90 = calculation.aggregates[0].value;
        } else if (calculation.alias === 'P50 Wall' && calculation.aggregates?.length > 0) {
          median = calculation.aggregates[0].value;
        }
      }

      return {
        p999,
        p99,
        p90,
        median
      };

    } catch (error) {
      console.error('Failed to fetch wall times from observability API:', error);
      throw error;
    }
  }
}
