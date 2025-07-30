# Workers HMD

An Health Mediated Deployments feature for Workers is a system that facilitates the staged, gradual rollout of new Workers versions to production. It integrates directly with Workers Observability for health metrics.

## Without HMD

The manual way to do this is to…
1. Create a new Worker version
2. Create a new deployment with 100% vCurrent and 0% vNew
3. Increment the deployment percent by a little bit and monitor health metrics for a time period
4. Decide to progress the percentage–or abort and set the deployment back to 100% vCurrent
5. Keep incrementing until you reach 100%, each time waiting and monitoring

So tedious… this should be automated!

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

## Simulation

Here's a simple Worker and script you can run to simulate unhealthy SLOs. The `rate=100` url param will cause 1 in 100 requests to have a larger latency. Uncomment the 500 error line to simulate 500 errors. In the HMD app, the Worker is called `simulated-service`. Set iterations to something like ten thousand or a million to just keep it running during an HMD release.

```bash
export cf_account_id="replace-me"
export cf_api_token="replace-me"
export cf_subdomain="replace-me"
```

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$cf_account_id/workers/scripts/simulated-service" \
  -X PUT \
  -H "Authorization: Bearer $cf_api_token" \
  -F "metadata={
        \"main_module\": \"simulated-service.mjs\",
        \"compatibility_date\": \"2025-07-24\",
        \"observability\": {
          \"enabled\": true
        }
      };type=application/json" \
  -F "simulated-service.mjs=@-;filename=simulated-service.mjs;type=application/javascript+module" <<EOF
export default {
  async fetch(request, env, ctx) {
    let url = new URL(request.url);
    let rate = url.searchParams.get('rate') ?? 100;
    const randomNumber = Math.floor(Math.random() * rate);
    // Simulate latencies
    if (randomNumber == 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.floor(Math.random() * 200)));
      // return new Response("Simulated 500 error", { status: 500 });
    } else {
      await new Promise(resolve => setTimeout(resolve, 10 + Math.floor(Math.random() * 20)));
    }
    return new Response("Hello world!", { status: 200 });
  }
};
EOF

curl "https://api.cloudflare.com/client/v4/accounts/$cf_account_id/workers/scripts/simulated-service/subdomain" \
  -X POST \
  -H "Authorization: Bearer $cf_api_token" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

```bash
#!/bin/bash

URL="https://simulated-service.$cf_subdomain.workers.dev?rate=10"
ITERATIONS=1000

# Create temporary file to store results
TEMP_FILE=$(mktemp)
trap 'rm -f "$TEMP_FILE"' EXIT

echo "CURLING $URL $ITERATIONS times..."

# Function to make a request and log the result
make_request() {
  local i=$1
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  echo "$http_code" >> "$TEMP_FILE"
  
  if [ $((i % 100)) -eq 0 ]; then
      echo "  Processed $i of $ITERATIONS requests..."
  fi
}

# Disable job control to suppress background job messages
set +m

# Run requests with max 2 parallel processes
for i in $(seq 1 $ITERATIONS); do
  make_request $i &
  
  # Limit to 2 background processes
  if [ $((i % 2)) -eq 0 ]; then
    wait
  fi
done

# Wait for any remaining background processes
wait

echo ""
echo "--- Results ---"
# Count and display results
sort "$TEMP_FILE" | uniq -c | while read count code; do
  echo "HTTP Status $code: $count times"
done
```
