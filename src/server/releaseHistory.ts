import { DurableObject } from "cloudflare:workers";
import type { components } from "../../types/api";

type Release = components["schemas"]["Release"];
type ReleaseState = components["schemas"]["Release"]["state"];

type ReleaseHistoryData = {
  releases: Release[];
};

export class ReleaseHistory extends DurableObject<Env> {
  private static readonly MAX_RELEASES = 100;
  private static readonly ALARM_INTERVAL = 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async getReleaseHistory(): Promise<ReleaseHistoryData> {
    const data = await this.ctx.storage.get<ReleaseHistoryData>("history");
    return data || { releases: [] };
  }

  private async saveReleaseHistory(data: ReleaseHistoryData): Promise<void> {
    await this.ctx.storage.put("history", data);
  }

  private async findReleaseIndex(
    id: string,
  ): Promise<{ history: ReleaseHistoryData; index: number }> {
    const history = await this.getReleaseHistory();
    const index = history.releases.findIndex((r) => r.id === id);
    return { history, index };
  }

  private calculateElapsedTime(startTime: string, endTime?: string): number {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    return Math.floor((end - start) / 1000);
  }

  private async setAlarmIfNeeded(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + ReleaseHistory.ALARM_INTERVAL);
  }

  private async clearAlarmIfNeeded(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
  }

  private async handleStateTransition(
    release: Release,
    previousState: ReleaseState,
    newState: ReleaseState,
  ): Promise<Release> {
    const updatedRelease = { ...release };

    // Handle starting a release
    if (previousState !== "running" && newState === "running") {
      updatedRelease.time_started = new Date().toISOString();
      updatedRelease.time_elapsed = 0;
      await this.setAlarmIfNeeded();
    }

    // Handle completing a release
    if (previousState === "running" && newState.startsWith("done_")) {
      if (!updatedRelease.time_done) {
        updatedRelease.time_done = new Date().toISOString();
      }

      if (updatedRelease.time_started) {
        updatedRelease.time_elapsed = this.calculateElapsedTime(
          updatedRelease.time_started,
          updatedRelease.time_done,
        );
      }

      await this.clearAlarmIfNeeded();
    }

    updatedRelease.state = newState;
    return updatedRelease;
  }

  private trimReleaseHistory(history: ReleaseHistoryData): void {
    if (history.releases.length > ReleaseHistory.MAX_RELEASES) {
      history.releases = history.releases.slice(0, ReleaseHistory.MAX_RELEASES);
    }
  }

  async createRelease(release: Release): Promise<Release> {
    const history = await this.getReleaseHistory();

    history.releases.unshift(release);
    this.trimReleaseHistory(history);

    await this.saveReleaseHistory(history);
    return release;
  }

  async addRelease(release: Release): Promise<void> {
    await this.createRelease(release);
  }

  async updateRelease(id: string, release: Release): Promise<Release> {
    const { history, index } = await this.findReleaseIndex(id);

    if (index === -1) {
      throw new Error(`Release ${id} not found`);
    }

    const previousState = history.releases[index].state;
    const updatedRelease = await this.handleStateTransition(
      release,
      previousState,
      release.state,
    );

    history.releases[index] = updatedRelease;
    await this.saveReleaseHistory(history);
    return updatedRelease;
  }

  async updateReleaseState(id: string, state: ReleaseState): Promise<boolean> {
    const { history, index } = await this.findReleaseIndex(id);

    if (index === -1) {
      return false;
    }

    const previousState = history.releases[index].state;
    const updatedRelease = await this.handleStateTransition(
      history.releases[index],
      previousState,
      state,
    );

    history.releases[index] = updatedRelease;
    await this.saveReleaseHistory(history);
    return true;
  }

  async getActiveRelease(): Promise<Release | undefined> {
    const history = await this.getReleaseHistory();

    // Find the first release that is in an active state
    const activeRelease = history.releases.find(
      (release) =>
        release.state === "not_started" || release.state === "running",
    );

    return activeRelease;
  }

  async hasActiveRelease(): Promise<boolean> {
    const activeRelease = await this.getActiveRelease();
    return activeRelease !== undefined;
  }

  async getAllReleases(): Promise<Release[]> {
    const history = await this.getReleaseHistory();
    return [...history.releases];
  }

  async alarm() {
    const history = await this.getReleaseHistory();
    let hasRunningRelease = false;

    for (let i = 0; i < history.releases.length; i++) {
      const release = history.releases[i];
      if (release.state === "running" && release.time_started) {
        history.releases[i].time_elapsed = this.calculateElapsedTime(
          release.time_started,
        );
        hasRunningRelease = true;
      }
    }

    await this.saveReleaseHistory(history);

    if (hasRunningRelease) {
      await this.setAlarmIfNeeded();
    }
  }

  async getRelease(id: string): Promise<Release | undefined> {
    const history = await this.getReleaseHistory();
    const release = history.releases.find((release) => release.id === id);
    return release;
  }

  async removeRelease(id: string): Promise<boolean> {
    const history = await this.getReleaseHistory();
    const initialLength = history.releases.length;

    history.releases = history.releases.filter((release) => release.id !== id);

    if (history.releases.length < initialLength) {
      await this.saveReleaseHistory(history);
      return true;
    }

    return false; // Release not found
  }

  async clearHistory(): Promise<void> {
    await this.saveReleaseHistory({ releases: [] });
  }
}
