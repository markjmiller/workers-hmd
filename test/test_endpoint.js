// Test script for the POST /api/plan endpoint

async function testPlanEndpoint() {
  const url = 'http://localhost:8787/api/plan';
  
  const planData = {
    stages: [
      {
        order: 0,
        target_percent: 0,
        soak_time: 0,
        auto_progress: false,
        description: "Start"
      },
      {
        order: 1,
        target_percent: 25,
        soak_time: 10,
        auto_progress: false,
        description: "Deploy to 25%"
      },
      {
        order: 2,
        target_percent: 100,
        soak_time: 10,
        auto_progress: false,
        description: "Deploy to 100%"
      }
    ],
    slos: [
      { value: "not5XX 999" },
      { value: "latency p99 100" }
    ]
  };

  try {
    console.log('Sending POST request to /api/plan...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(planData),
    });

    const data = await response.json();
    console.log(`Response status: ${response.status}`);
    console.log('Response data:', data);
    return data;
  } catch (error) {
    console.error('Error making request:', error);
  }
}

// Run the test
testPlanEndpoint();
