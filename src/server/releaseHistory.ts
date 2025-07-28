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
    }
    if (previousState === "running" && (state === "done_successful" || state === "done_stopped_manually" || state === "done_failed_slo")) {
      history.releases[releaseIndex].time_done = new Date().toISOString();
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
    const _history = [...history.releases];
    // TODO: calculate time elapsed
    _history.map(release => release.time_elapsed = 120);
    return _history;
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