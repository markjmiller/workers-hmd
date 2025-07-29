import { DurableObject } from "cloudflare:workers";
import type { components } from "../../types/api";

type Stage = components["schemas"]["ReleaseStage"];
type StageState = Stage["state"];

export class StageStorage extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async get(): Promise<Stage | null> {
    return await this.ctx.storage.get<Stage>("main") || null;
  }

  private async save(stage: Stage): Promise<void> {
    await this.ctx.storage.put("main", stage);
  }

  /**
   * Initialize this stage with the provided data
   */
  async initialize(stage: Stage): Promise<Stage> {
    await this.save(stage);
    return stage;
  }

  /**
   * Generate verbose log message for state transitions
   */
  private getVerboseStateMessage(newState: StageState, previousState?: StageState): string | undefined {
    const transitionKey = `${previousState}->${newState}`;
    
    switch (transitionKey) {
      case 'queued->running':
        return `🚀 Stage started - beginning soak period`;
      case 'running->awaiting_approval':
        return `⏸️ Stage soak period completed - awaiting manual approval to continue`;
      case 'awaiting_approval->running':
        return `✅ Stage approved by user - continuing`;
      case 'running->done_successful':
        return `🎉 Stage completed successfully`;
      case 'awaiting_approval->done_successful':
        return `🎉 Stage completed successfully`;
      case 'running->done_failed':
        return `❌ Stage failed SLOs`;
      case 'awaiting_approval->done_cancelled':
        return `🚫 Stage cancelled by user - release stopped`;
      case 'awaiting_approval->done_failed':
        return `❌ Stage failed while awaiting approval`;
      case 'queued->done_failed':
        return `❌ Previous stage failed. This stage will not run.`;
      case 'queued->done_cancelled':
        return `🚫 Previous stage failed or cancelled. This stage will not run.`;
      default:
        return undefined;
    }
  }

  /**
   * Update stage state and related timing information
   */
  async updateStageState(newState: StageState, logs?: string): Promise<Stage | null> {
    const stage = await this.get();
    
    if (!stage) {
      return null;
    }

    const now = new Date().toISOString();
    const updatedStage: Stage = {
      ...stage,
      state: newState,
      logs: logs || stage.logs,
    };

    // Update timing based on state transitions
    if (newState === "running" && stage.state === "queued") {
      updatedStage.time_started = now;
      updatedStage.time_elapsed = 0;
      // Set alarm to update elapsed time every second
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    } else if ((newState === "done_failed" || newState === "done_successful") && 
               (stage.state === "running" || stage.state === "awaiting_approval")) {
      updatedStage.time_done = now;
      if (stage.time_started) {
        updatedStage.time_elapsed = Math.floor((new Date(now).getTime() - new Date(stage.time_started).getTime()) / 1000);
      }
      // Clear the alarm since stage is done
      await this.ctx.storage.deleteAlarm();
    }

    // Add verbose log messages for state transitions
    const verboseLogMessage = this.getVerboseStateMessage(newState, stage.state);
    if (verboseLogMessage) {  
      this.addLog(verboseLogMessage);
    }

    await this.save(updatedStage);
    return updatedStage;
  }

  /**
   * Progress this stage based on approval/denial
   */
  async progressStage(command: "approve" | "deny"): Promise<Stage | null> {
    const stage = await this.get();
    
    if (!stage) {
      return null;
    }

    let newState: StageState;
    let logs = stage.logs;

    if (command === "approve") {
      newState = "done_successful";
      logs += `\n[${new Date().toISOString()}] Stage approved.`;
    } else {
      newState = "done_cancelled";
      logs += `\n[${new Date().toISOString()}] Stage not approved. Cancelling release...`;
    }

    return await this.updateStageState(newState, logs);
  }

  /**
   * Update the stage with new data (partial update)
   */
  async updateStage(updates: Partial<Stage>): Promise<Stage | null> {
    const stage = await this.get();
    
    if (!stage) {
      return null;
    }

    const previousState = stage.state;
    const updatedStage: Stage = {
      ...stage,
      ...updates,
    };
    const newState = updatedStage.state;
    
    // Handle alarm setup/cleanup based on state transitions
    if (previousState !== 'running' && newState === 'running') {
      // Starting a stage - set up alarm
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    } else if (previousState === 'running' && (newState === 'done_successful' || newState === 'done_failed')) {
      // Completing a stage - set time_done if not already provided, calculate final elapsed time and clear alarm
      if (!updates.time_done) {
        updatedStage.time_done = new Date().toISOString();
      }
      if (stage.time_started && !updates.time_elapsed) {
        const startTime = new Date(stage.time_started).getTime();
        const endTime = updatedStage.time_done ? new Date(updatedStage.time_done).getTime() : Date.now();
        updatedStage.time_elapsed = Math.floor((endTime - startTime) / 1000);
      }
      await this.ctx.storage.deleteAlarm();
    }

    await this.save(updatedStage);
    return updatedStage;
  }

  /**
   * Add a log entry to the stage
   */
  async addLog(message: string): Promise<Stage | null> {
    const stage = await this.get();
    
    if (!stage) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const logEntry = `\n[${timestamp}] ${message}`;
    const updatedLogs = stage.logs + logEntry;

    return await this.updateStage({ logs: updatedLogs });
  }

  // Alarm handler to update elapsed time for running stage
  async alarm() {
    const stage = await this.get();
    
    if (!stage || stage.state !== 'running' || !stage.time_started) {
      // Stage is not running or doesn't exist, don't set another alarm
      return;
    }
    
    const startTime = new Date(stage.time_started).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    
    const updatedStage: Stage = {
      ...stage,
      time_elapsed: elapsedSeconds,
    };
    
    await this.save(updatedStage);
    
    // Set next alarm to continue updating elapsed time
    await this.ctx.storage.setAlarm(Date.now() + 1000);
  }
}
