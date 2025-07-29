import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

export type ReleaseWorkflowParams = {
  releaseId: string;
};

export class ReleaseWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ReleaseWorkflowParams> {
  async run(event: WorkflowEvent<ReleaseWorkflowParams>, step: WorkflowStep) {
    try {
      console.log(`🚀 Starting workflow for release: ${event.payload.releaseId}`);
      const { releaseId } = event.payload;

      const releaseHistory = this.env.RELEASE_HISTORY.get(this.env.RELEASE_HISTORY.idFromName("main"));
      const release = await releaseHistory.getRelease(event.payload.releaseId);
      
      if (!release) {
        console.error(`❌ Release ${releaseId} not found!`);
        return;
      }
      
      console.log(`📋 Found release with ${release.stages.length} stages`);

      await step.do("update release state to running", async () => {
        await releaseHistory.updateReleaseState(releaseId, "running");
      });

      // Helper function to update remaining stages when workflow stops
      const updateRemainingStages = async (failureState: "done_cancelled" | "done_failed", currentStageOrder: number) => {
        const remainingStages = release!.plan_record.stages.filter(s => s.order > currentStageOrder);
        console.log(`🔍 Found ${remainingStages.length} remaining stages to update after stage ${currentStageOrder}`);
        
        for (const remainingStage of remainingStages) {
          const remainingStageStorage = this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(`release-${event.payload.releaseId}-order-${remainingStage.order}`));
          const currentStageData = await remainingStageStorage.get();
          // Only update stages that exist and are not already in a done state
          if (currentStageData) {
            await remainingStageStorage.updateStageState(failureState);
            console.log(`🚫 Set remaining stage ${remainingStage.order} to ${failureState}`);
          }
        }
      };

      // Process each stage in order
      for (const stage of release!.stages) {
        const stagePlan = release!.plan_record.stages.find(s => s.order === stage.order);
        if (!stagePlan) {
          console.error(`❌ No plan found for stage ${stage.id}`);
          continue;
        }
        
        console.log(`🎬 Starting stage ${stage.order}: ${stagePlan.soak_time}s soak`);
        const stageStorage = this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(stage.id));

        await step.do(`${stage.id} - start`, async () => {
          await stageStorage.updateStageState("running");
          // TODO make Workers deployment API call and increment to stagePlan.target_percent
        });

        for (let i = 0; i < stagePlan.soak_time; i++) {
          await step.sleep(`${stage.id} - soak`, "1 second");
          console.log(`🛁 Stage ${stage.order} soak - Checking SLOs`);
          // if (Math.random() > 0.9) {
          //   console.log(`❌ Stage ${stage.order} soak failed - stopping release`);
          //   await stageStorage.updateStageState("done_failed");
          //   await updateRemainingStages("done_cancelled", stage.order);
          //   await releaseHistory.updateReleaseState(event.payload.releaseId, "done_failed_slo");
          //   return;
          // }
        }

        console.log(`🛁 Stage ${stage.order} soak completed`);

        // Skip approval for the last stage or auto-progress stages
        const isLastStage = stage.order === Math.max(...release!.plan_record.stages.map(s => s.order));
        if (!stagePlan.auto_progress && !isLastStage) {
          await stageStorage.updateStageState("awaiting_approval");
          const waitForApproval = await step.waitForEvent(`Waiting for stage ${stage.id} approval`, {
            type: `${stage.id}-user-progess-command`
          });
          if (waitForApproval.payload === "approve") {
            console.log(`✔️ Stage ${stage.order} approved`);
            // Continue with normal workflow - stage will be completed in the next step.do block
          } else if (waitForApproval.payload === "deny") {
            console.log(`❌ Stage ${stage.order} denied - stopping release`);
            
            await step.do(`Cancel stage ${stage.id} and remaining stages`, async () => {
              await stageStorage.updateStageState("done_cancelled");
              
              // Update all remaining stages to cancelled state
              await updateRemainingStages("done_cancelled", stage.order);
              
              // Stop the entire release
              const releaseHistory = this.env.RELEASE_HISTORY.get(this.env.RELEASE_HISTORY.idFromName("main"));
              await releaseHistory.updateReleaseState(event.payload.releaseId, "done_stopped_manually");
              console.log(`🛑 Release stopped - stage ${stage.order} denied`);
            });
            
            return; // Exit the workflow
          }
        }

        await step.do(`${stage.id} - done`, async () => {
          await stageStorage.updateStageState("done_successful");
          console.log(`✅ Stage ${stage.order} completed`);
        });
      }

      await step.do("update release state to done_successful", async () => {
        await releaseHistory.updateReleaseState(event.payload.releaseId, "done_successful");
        console.log(`🎉 Release ${releaseId} completed successfully`);
      });
      
    } catch (error) {
      console.error(`💥 Workflow error for release ${event.payload.releaseId}:`, error);
      // Try to update release state to failed and set remaining stages to failed
      try {
        const releaseHistory = this.env.RELEASE_HISTORY.get(this.env.RELEASE_HISTORY.idFromName("main"));
        const release = await releaseHistory.getRelease(event.payload.releaseId);
        if (!release) {
          throw new Error(`Release ${event.payload.releaseId} not found`);
        }
        
        // Set all remaining stages to failed state
        const allStages = release.plan_record.stages;
        for (const stageInfo of allStages) {
          const stageStorage = this.env.STAGE_STORAGE.get(this.env.STAGE_STORAGE.idFromName(`${event.payload.releaseId}-order-${stageInfo.order}`));
          const currentStage = await stageStorage.get();
          // Only update stages that are not already in a done state
          if (currentStage && !currentStage.state.startsWith('done_')) {
            await stageStorage.updateStageState("done_failed");
            console.log(`❌ Set stage ${stageInfo.order} to done_failed due to workflow error`);
          }
        }
        
        await releaseHistory.updateReleaseState(event.payload.releaseId, "done_failed_slo");
      } catch (updateError) {
        console.error(`Failed to update release state to failed:`, updateError);
      }
      throw error;
    }
  }
}
