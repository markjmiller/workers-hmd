# Requirements

## Release Plan
Users can create a release plan. In the release plan…
- Users can define an SLO, such as…
    * p99 latency is less than 100ms during `soak_time`
    * 99.9% of requests are not 5xx status codes during `soak_time`
    * SLIs such as request latency or number of 5xx status codes is sourced from Workers Observability
- Users can define any number of release stages in a release plan
- Users can drag and drop stages to reorder them
- For MVP, there’s only one release plan

## Release Stages

In a release plan, users can define stages. In a stage, users define…
- The % target of the deployment to the new Worker version. Each stage has to be a larger (integer) percent value than the previous
- How long the soak time is in minutes
- Whether the stage automatically progresses or if it needs a human to manually progress it
Note: a release will not abort until the full soak time passes. A more robust system would poll a smaller time interval during the stage, and possibly abort in the middle. For MVP simplicity, we’ll just pin the SLO interval to the soak time.

## Release

A user creates a release, which is an instance of the Release Plan. Before a release, a user uploads a new Worker version. Example: “wrangler versions upload”
- A user starts a release by pressing the “Start Release” button
- The release start button will not work if there is an active split deployment
- A release by default will use the currently deployed Workers version as the start and the latest Worker version as the 100% target. However, the version being rolled out to can explicitly selected in the UI or be specified by its ID.
- A user can abort a release by pressing a button at any time
