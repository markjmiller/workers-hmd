import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Cloudflare as cf } from 'cloudflare';
import { components } from '../../types/api';
import { ReleaseHistory } from './releaseHistory';
import { StageStorage } from './stage';

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

      await step.do("update release state to done_successful", async () => {
        await releaseHistory.updateReleaseState(releaseId, "done_successful");
        console.log(`🎉 Release ${releaseId} completed successfully`);
      });

      await this.finishDeployment(releaseId, release.plan_record.worker_name, release.new_version);
      
    } catch (error) {
      console.error(`💥 Workflow error for release ${releaseId}:`, error);
      await this.handleWorkflowError(releaseId);
      if (release) {
        await this.revertDeployment(releaseId, release.plan_record.worker_name, release.old_version);
      }
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

      await this.processStageSoak(step, stage, stagePlan);
      console.log(`🛁 Stage ${stage.order} soak completed`);

      const shouldWaitForApproval = await this.handleStageApproval(step, stage, stagePlan, release, stageStorage, updateRemainingStages, releaseHistory, releaseId);
      if (shouldWaitForApproval === 'exit') return;

      await step.do(`${stage.id} - done`, async () => {
        await stageStorage.updateStageState("done_successful");
        console.log(`✅ Stage ${stage.order} completed`);
      });
    }
  }

  private async processStageSoak(step: WorkflowStep, stage: StageId, stagePlan: PlanStage) {
    for (let i = 0; i < stagePlan.soak_time; i++) {
      // Check if release was stopped
      const releaseHistory = this.getReleaseHistory();
      const release = await releaseHistory.getActiveRelease();
      if (release?.state !== 'running') {
        return;
      }
      await step.sleep(`${stage.id} - soak`, "1 second");
      console.log(`🛁 Stage ${stage.order} soak - Checking SLOs`);
    }
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
      await stageStorage.updateStageState("awaiting_approval");
      console.log(`⏳ Stage ${stage.order} awaiting approval`);
      const waitForApproval = await step.waitForEvent(`Waiting for stage ${stage.id} approval`, {
        type: `${stage.id}-user-progress-command`
      });
      
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
        });
        
        return 'exit';
      }
    }
    
    return 'continue';
  }

  private async handleWorkflowError(releaseId: string) {
    try {
      const releaseHistory = this.getReleaseHistory();
      const release = await releaseHistory.getRelease(releaseId);
      
      if (!release) {
        throw new Error(`Release ${releaseId} not found`);
      }
      
      await this.updateStagesState(releaseId, release.plan_record.stages, "done_failed", true);
      await releaseHistory.updateReleaseState(releaseId, "done_failed_slo");
    } catch (updateError) {
      console.error(`Failed to update release state to failed:`, updateError);
    }
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
    this.client!.workers.scripts.deployments.create(worker_name, {
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
    this.client!.workers.scripts.deployments.create(worker_name, {
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
    this.client!.workers.scripts.deployments.create(worker_name, {
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
}
