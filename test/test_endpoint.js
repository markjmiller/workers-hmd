// Test script for Workers HMD API endpoints
// Usage: node test_endpoint.js [endpoint]
// Available endpoints: plan, release, release-active

const BASE_URL = 'http://localhost:5173/api';

async function testPlanEndpoint() {
  const url = `${BASE_URL}/plan`;
  
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
    console.log('=== Testing POST /api/plan ===');
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
    console.log('Response data:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('Error making request:', error);
    return null;
  }
}

async function testGetReleaseEndpoint() {
  const url = `${BASE_URL}/release?limit=1&offset=0`;

  try {
    console.log('=== Testing GET /api/release ===');
    console.log('Sending GET request to /api/release...');
    const response = await fetch(url, {
      method: 'GET',
    });

    const data = await response.json();
    console.log(`Response status: ${response.status}`);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('Error making request:', error);
    return null;
  }
}

async function testAddReleaseEndpoint() {
  const url = `${BASE_URL}/release`;

  try {
    console.log('=== Testing POST /api/release ===');
    console.log('Sending POST request to /api/release...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log(`Response status: ${response.status}`);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.status === 409) {
      console.log('NOTE: Release already exists - this is expected if one is already active');
    }
    
    return data;
  } catch (error) {
    console.error('Error making request:', error);
    return null;
  }
}

async function testDeleteReleaseEndpoint() {
  try {
    console.log('=== Testing DELETE /api/release/{releaseId} ===');
    
    // First, get the active release to get its ID
    console.log('Getting active release to find releaseId...');
    const activeResponse = await fetch(`${BASE_URL}/release/active`);
    
    if (!activeResponse.ok) {
      console.log('No active release found - cannot test DELETE endpoint');
      console.log(`Response status: ${activeResponse.status}`);
      return null;
    }
    
    const activeRelease = await activeResponse.json();
    const releaseId = activeRelease.id;
    console.log(`Found active release with ID: ${releaseId}`);
    
    // Now delete the release
    const deleteUrl = `${BASE_URL}/release/${releaseId}`;
    console.log(`Sending DELETE request to /api/release/${releaseId}...`);
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
    });

    console.log(`Response status: ${response.status}`);
    
    // Handle different response types
    if (response.status === 200) {
      console.log('Release deleted successfully');
      const responseText = await response.text();
      console.log('Response:', responseText);
      return { success: true, message: responseText };
    } else {
      const data = await response.json();
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      if (response.status === 409) {
        console.log('NOTE: Release cannot be deleted - must be in "not_started" state');
      } else if (response.status === 404) {
        console.log('NOTE: Release not found');
      }
      
      return data;
    }
  } catch (error) {
    console.error('Error making request:', error);
    return null;
  }
}

async function testReleaseActiveEndpoint() {
  const url = `${BASE_URL}/release/active`;

  try {
    console.log('=== Testing GET /api/release/active ===');
    console.log('Sending GET request to /api/release/active...');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log(`Response status: ${response.status}`);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    if (response.status === 404) {
      console.log('NOTE: No active release found - this is expected if no release has been created');
    }
    
    return data;
  } catch (error) {
    console.error('Error making request:', error);
    return null;
  }
}

function showUsage() {
  console.log('Usage: node test_endpoint.js [endpoint]');
  console.log('Available endpoints:');
  console.log('  plan           - Test POST    /api/plan');
  console.log('  release        - Test POST    /api/release');
  console.log('  release-active - Test GET     /api/release/active');
  console.log('  delete-release - Test DELETE  /api/release');
}

async function main() {
  const args = process.argv.slice(2);
  const endpoint = args[0];

  if (endpoint === 'help' || endpoint === '--help' || endpoint === '-h') {
    showUsage();
    return;
  }

  switch (endpoint) {
    case 'plan':
      await testPlanEndpoint();
      break;
    case 'get-release':
      await testGetReleaseEndpoint();
      break;
    case 'add-release':
      await testAddReleaseEndpoint();
      break;
    case 'release-active':
      await testReleaseActiveEndpoint();
      break;
    case 'delete-release':
      await testDeleteReleaseEndpoint();
      break;
    default:
      console.error(`Unknown endpoint: ${endpoint}`);
      showUsage();
      process.exit(1);
  }
}

main().catch(console.error);
