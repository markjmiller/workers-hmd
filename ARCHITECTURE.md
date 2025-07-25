# Architecture

## Release Plan and Stages

- The release plan is stored as a durable object
- Each release stage is stored as a record

## Start release

- This creates a new Workflow, with steps generated from the release plan stages
- Each step simply sleeps for the soak time, then queries Workers Observability for the specified SLI and compares it to the SLO threshold.
- If the SLO is violated, the Workflow will exit
- Else, continue to the next step (if automatic, otherwise waitForEvent “human-approved”) until all steps are done.

## SLOs

- Based on SLIs from Workers Observability
- For MVP, this won’t be a rich SLO builder. It will just be the preset SLOs listed in the requirements, but the user can configure relevant values
- The API will take something like: “latency p99 100” or “not5XX 999

## TODO
