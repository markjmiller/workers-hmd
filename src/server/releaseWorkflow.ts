import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

export type ReleaseWorkflowParams = {
  releaseId: string;
};

export class ReleaseWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ReleaseWorkflowParams> {
  private getReleaseHistory() {
    return this.env.RELEASE_HISTORY.get(this.env.RELEASE_HISTORY.idFromName("main"));
  }

  private getStageStorage(releaseId: string, stageOrder: number) {
    return this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(`release-${releaseId}-order-${stageOrder}`));
  }

  private async updateStagesState(releaseId: string, stages: any[], state: "done_cancelled" | "done_failed", excludeCompleted = true) {
    for (const stage of stages) {
      const stageStorage = this.getStageStorage(releaseId, stage.order);
      const currentStageData = await stageStorage.get();
      
      if (currentStageData && (!excludeCompleted || !currentStageData.state.startsWith('done_'))) {
        await stageStorage.updateStageState(state);
        console.log(`🚫 Set stage ${stage.order} to ${state}`);
      }
    }
  }

  async run(event: WorkflowEvent<ReleaseWorkflowParams>, step: WorkflowStep) {
    const { releaseId } = event.payload;
    console.log(`🚀 Starting workflow for release: ${releaseId}`);

    try {
      const releaseHistory = this.getReleaseHistory();
      const release = await releaseHistory.getRelease(releaseId);
      
      if (!release) {
        console.error(`❌ Release ${releaseId} not found!`);
        return;
      }
      
      console.log(`📋 Found release with ${release.stages.length} stages`);

      await step.do("update release state to running", async () => {
        await releaseHistory.updateReleaseState(releaseId, "running");
      });

      await this.processStages(event, step, release, releaseHistory);

      await step.do("update release state to done_successful", async () => {
        await releaseHistory.updateReleaseState(releaseId, "done_successful");
        console.log(`🎉 Release ${releaseId} completed successfully`);
      });
      
    } catch (error) {
      console.error(`💥 Workflow error for release ${releaseId}:`, error);
      await this.handleWorkflowError(releaseId);
      throw error;
    }
  }

  private async processStages(event: WorkflowEvent<ReleaseWorkflowParams>, step: WorkflowStep, release: any, releaseHistory: any) {
    const { releaseId } = event.payload;
    
    const updateRemainingStages = async (failureState: "done_cancelled" | "done_failed", currentStageOrder: number) => {
      const remainingStages = release.plan_record.stages.filter((s: any) => s.order > currentStageOrder);
      console.log(`🔍 Found ${remainingStages.length} remaining stages to update after stage ${currentStageOrder}`);
      await this.updateStagesState(releaseId, remainingStages, failureState);
    };

    for (const stage of release.stages) {
      const stagePlan = release.plan_record.stages.find((s: any) => s.order === stage.order);
      if (!stagePlan) {
        console.error(`❌ No plan found for stage ${stage.id}`);
        continue;
      }
      
      console.log(`🎬 Starting stage ${stage.order}: ${stagePlan.soak_time}s soak`);
      const stageStorage = this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(stage.id));

      await step.do(`${stage.id} - start`, async () => {
        await stageStorage.updateStageState("running");
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

  private async processStageSoak(step: WorkflowStep, stage: any, stagePlan: any) {
    for (let i = 0; i < stagePlan.soak_time; i++) {
      // Check if release was stopped
      const release = await this.getReleaseHistory().getActiveRelease();
      if (release?.state !== 'running') {
        return;
      }
      await step.sleep(`${stage.id} - soak`, "1 second");
      console.log(`🛁 Stage ${stage.order} soak - Checking SLOs`);
    }
  }

  private async handleStageApproval(
    step: WorkflowStep, 
    stage: any, 
    stagePlan: any, 
    release: any, 
    stageStorage: any, 
    updateRemainingStages: (state: "done_cancelled" | "done_failed", order: number) => Promise<void>,
    releaseHistory: any,
    releaseId: string
  ): Promise<'continue' | 'exit'> {
    const isLastStage = stage.order === Math.max(...release.plan_record.stages.map((s: any) => s.order));
    
    if (!stagePlan.auto_progress && !isLastStage) {
      await stageStorage.updateStageState("awaiting_approval");
      const waitForApproval = await step.waitForEvent(`Waiting for stage ${stage.id} approval`, {
        type: `${stage.id}-user-progess-command`
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
}
