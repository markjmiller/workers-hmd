import { DurableObject } from "cloudflare:workers";
import type { components } from "../../types/api";

type Stage = components["schemas"]["ReleaseStage"];
type StageState = Stage["state"];

export class StageStorage extends DurableObject<Env> {
  private static readonly ALARM_INTERVAL = 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async get(): Promise<Stage | null> {
    return (await this.ctx.storage.get<Stage>("main")) || null;
  }

  private async save(stage: Stage): Promise<void> {
    await this.ctx.storage.put("main", stage);
  }

  private getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  private calculateElapsedTime(startTime: string, endTime?: string): number {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    return Math.floor((end - start) / 1000);
  }

  private async setAlarmIfNeeded(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + StageStorage.ALARM_INTERVAL);
  }

  private async clearAlarmIfNeeded(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
  }

  private async handleStateTransition(
    stage: Stage,
    newState: StageState,
  ): Promise<Stage> {
    const now = this.getCurrentTimestamp();
    const updatedStage: Stage = { ...stage, state: newState };

    if (newState === "running" && stage.state === "queued") {
      updatedStage.time_started = now;
      updatedStage.time_elapsed = 0;
      await this.setAlarmIfNeeded();
    }

    if (
      (newState === "done_failed" || newState === "done_successful") &&
      (stage.state === "running" || stage.state === "awaiting_approval")
    ) {
      updatedStage.time_done = now;
      if (stage.time_started) {
        updatedStage.time_elapsed = this.calculateElapsedTime(
          stage.time_started,
          now,
        );
      }
      await this.clearAlarmIfNeeded();
    }

    return updatedStage;
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
  private getVerboseStateMessage(
    newState: StageState,
    previousState?: StageState,
  ): string | undefined {
    const transitionKey = `${previousState}->${newState}`;

    switch (transitionKey) {
      case "queued->running":
        return `🚀 Stage started - beginning soak period`;
      case "running->awaiting_approval":
        return `⏸️ Stage soak period completed - awaiting manual approval to continue`;
      case "awaiting_approval->running":
        return `✅ Stage approved by user - continuing`;
      case "running->done_successful":
        return `🎉 Stage completed successfully and auto progressed`;
      case "awaiting_approval->done_successful":
        return `🎉 Stage completed successfully`;
      case "running->done_failed":
        return `❌ Stage failed SLOs`;
      case "awaiting_approval->done_cancelled":
        return `🚫 Stage cancelled by user - release stopped`;
      case "awaiting_approval->done_failed":
        return `❌ Stage failed while awaiting approval`;
      case "queued->done_failed":
        return `❌ Previous stage failed. This stage will not run.`;
      case "queued->done_cancelled":
        return `🚫 Previous stage failed or cancelled. This stage will not run.`;
      default:
        return undefined;
    }
  }

  /**
   * Update stage state and related timing information
   */
  async updateStageState(
    newState: StageState,
    logs?: string,
  ): Promise<Stage | null> {
    const stage = await this.get();

    if (!stage) {
      return null;
    }

    const updatedStage = await this.handleStateTransition(stage, newState);
    updatedStage.logs = logs || stage.logs;

    // Add verbose log messages for state transitions
    const verboseLogMessage = this.getVerboseStateMessage(
      newState,
      stage.state,
    );
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

    const newState: StageState =
      command === "approve" ? "done_successful" : "done_cancelled";
    const message =
      command === "approve"
        ? "Stage approved."
        : "Stage not approved. Cancelling release...";
    const logs = stage.logs + `\n[${this.getCurrentTimestamp()}] ${message}`;

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
    const partiallyUpdated: Stage = { ...stage, ...updates };
    const newState = partiallyUpdated.state;

    // Handle state transitions if state changed
    const updatedStage =
      previousState !== newState
        ? await this.handleStateTransition(stage, newState)
        : partiallyUpdated;

    // Apply any remaining updates that weren't handled by state transition
    const finalStage = { ...updatedStage, ...updates };

    await this.save(finalStage);
    return finalStage;
  }

  /**
   * Add a log entry to the stage
   */
  async addLog(message: string): Promise<Stage | null> {
    const stage = await this.get();

    if (!stage) {
      return null;
    }

    const logEntry = `\n[${this.getCurrentTimestamp()}] ${message}`;
    const updatedLogs = stage.logs + logEntry;

    return await this.updateStage({ logs: updatedLogs });
  }

  async alarm() {
    const stage = await this.get();

    if (!stage || stage.state !== "running" || !stage.time_started) {
      return;
    }

    const elapsedSeconds = this.calculateElapsedTime(stage.time_started);
    const updatedStage: Stage = { ...stage, time_elapsed: elapsedSeconds };

    await this.save(updatedStage);

    // Set next alarm to continue updating elapsed time
    await this.ctx.storage.setAlarm(Date.now() + 1000);
  }
}
