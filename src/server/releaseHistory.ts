import { DurableObject } from "cloudflare:workers";
import type { components } from "../../types/api";

type Release = components["schemas"]["Release"];
type ReleaseState = components["schemas"]["Release"]["state"];

type ReleaseHistoryData = {
  releases: Release[];
};

export class ReleaseHistory extends DurableObject<Env> {
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

  async createRelease(release: Release): Promise<Release> {
    const history = await this.getReleaseHistory();
    
    // Add to beginning of array (most recent first)
    history.releases.unshift(release);
    
    // Keep only last 100 releases to prevent unbounded growth
    if (history.releases.length > 100) {
      history.releases = history.releases.slice(0, 100);
    }
    
    await this.saveReleaseHistory(history);
    return release;
  }

  async addRelease(release: Release): Promise<void> {
    await this.createRelease(release);
  }

  async updateRelease(id: string, release: Release): Promise<Release> {
    const history = await this.getReleaseHistory();
    const releaseIndex = history.releases.findIndex(r => r.id === id);
    
    if (releaseIndex === -1) {
      throw new Error(`Release ${id} not found`);
    }
    
    const previousState = history.releases[releaseIndex].state;
    const newState = release.state;
    
    // Handle alarm setup/cleanup based on state transitions
    if (previousState !== 'running' && newState === 'running') {
      // Starting a release - set up alarm
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    } else if (previousState === 'running' && newState.startsWith('done_')) {
      // Completing a release - set time_done if not already provided, calculate final elapsed time and clear alarm
      if (!release.time_done) {
        release.time_done = new Date().toISOString();
      }
      const currentRelease = history.releases[releaseIndex];
      if (currentRelease.time_started && !release.time_elapsed) {
        const startTime = new Date(currentRelease.time_started).getTime();
        const endTime = release.time_done ? new Date(release.time_done).getTime() : Date.now();
        release.time_elapsed = Math.floor((endTime - startTime) / 1000);
      }
      await this.ctx.storage.deleteAlarm();
    }
    
    history.releases[releaseIndex] = release;
    await this.saveReleaseHistory(history);
    return release;
  }

  async updateReleaseState(id: string, state: ReleaseState): Promise<boolean> {
    const history = await this.getReleaseHistory();
    const releaseIndex = history.releases.findIndex(release => release.id === id);
    
    if (releaseIndex === -1) {
      return false; // Release not found
    }
    const previousState = history.releases[releaseIndex].state;
    if (previousState === "not_started" && state === "running") {
      history.releases[releaseIndex].time_started = new Date().toISOString();
      history.releases[releaseIndex].time_elapsed = 0;
      // Set alarm to update elapsed time every second
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
    if (previousState === "running" && (state === "done_successful" || state === "done_stopped_manually" || state === "done_failed_slo")) {
      history.releases[releaseIndex].time_done = new Date().toISOString();
      // Calculate final elapsed time
      if (history.releases[releaseIndex].time_started) {
        const startTime = new Date(history.releases[releaseIndex].time_started!).getTime();
        const endTime = new Date().getTime();
        history.releases[releaseIndex].time_elapsed = Math.floor((endTime - startTime) / 1000);
      }
      // Clear the alarm since release is done
      await this.ctx.storage.deleteAlarm();
    }
    history.releases[releaseIndex].state = state;
    await this.saveReleaseHistory(history);
    return true;
  }

  async getActiveRelease(): Promise<Release | undefined> {
    const history = await this.getReleaseHistory();
    
    // Find the first release that is in an active state
    const activeRelease = history.releases.find(release => 
      release.state === "not_started" ||
      release.state === "running"
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

  // Alarm handler to update elapsed time for running releases
  async alarm() {
    const history = await this.getReleaseHistory();
    let shouldContinueAlarm = false;
    
    // Find running releases and update their elapsed time
    for (let i = 0; i < history.releases.length; i++) {
      const release = history.releases[i];
      if (release.state === 'running' && release.time_started) {
        const startTime = new Date(release.time_started).getTime();
        const now = Date.now();
        history.releases[i].time_elapsed = Math.floor((now - startTime) / 1000);
        shouldContinueAlarm = true;
      }
    }
    
    // Save updated history
    await this.saveReleaseHistory(history);
    
    // Set next alarm if we still have running releases
    if (shouldContinueAlarm) {
      await this.ctx.storage.setAlarm(Date.now() + 1000);
    }
  }

  async getRelease(id: string): Promise<Release | undefined> {
    const history = await this.getReleaseHistory();
    const release = history.releases.find(release => release.id === id);
    return release;
  }

  // async getCompletedReleases(): Promise<Release[]> {
  //   const history = await this.getReleaseHistory();
  //   return history.releases.filter(release => 
  //     release.state === "done_successful" ||
  //     release.state === "stopped_failed_slo"
  //   );
  // }

  // async getRecentReleases(limit: number = 10): Promise<Release[]> {
  //   const history = await this.getReleaseHistory();
  //   return history.releases.slice(0, limit);
  // }

  async removeRelease(id: string): Promise<boolean> {
    const history = await this.getReleaseHistory();
    const initialLength = history.releases.length;
    
    history.releases = history.releases.filter(release => release.id !== id);
    
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