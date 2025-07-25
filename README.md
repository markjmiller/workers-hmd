# Workers HMD

An Health Mediated Deployments feature for Workers is a system that facilitates the staged, gradual rollout of new Workers versions to production, ideally integrating directly with Workers Observability for health metrics.

## Without HMD

The manual way to do this is to…
1. Create a new Worker version
2. Create a new deployment with 100% vOld and 0% vNew
3. Increment the deployment percent by a little bit and monitor health metrics for a time period
4. Decide to progress the percentage–or abort and set the deployment back to 100% vOld
5. Keep incrementing until you reach 100%, each time waiting and monitoring
So tedious… let’s automate it!

## HMD for Workers

Here's how the feature works:
1. **Release Definition**: users define a release plan with…
    * An SLO based on SLIs sourced from Workers Observability
    * Customizable stages that define…
        * % rollout
        * Soak time
        * Whether the stage progresses manually or automatically
2. **Version Creation**: To initiate a production release, users create a new Worker version. By default, this has 0% traffic routed to it.
3. **Release Start**: Users then start a release, which is an instance of the release plan. Each stage in the plan progressively increases the percentage of traffic directed from the old Worker version to the new one. For example, a release might consist of stages at 0%, 25%, 50%, 75%, and 100% rollout.
4. **Staged Rollout with Soak Periods**: Within each stage, a soak period begins. During this time, the system continuously monitors user-defined SLIs (e.g., rate of 5xx errors) against their corresponding SLOs.
5. **Progression and Abort**:
    * If the soak period completes without any SLO violations, the stage can either be manually or automatically progressed to the next stage, increasing the traffic to the new Worker version.
    * Crucially, if an SLO is violated at any point, the rollout automatically aborts. The deployment is immediately reverted to 100% of the old Worker version, and the new version receives 0% of the traffic.
6. **Completion**: If all stages successfully pass without SLO violations, the new Worker version reached 100% deployment, meaning all production traffic is now routed to it. At this point, the release is considered complete.
