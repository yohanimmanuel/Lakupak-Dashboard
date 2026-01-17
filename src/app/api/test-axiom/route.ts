import { NextRequest, NextResponse } from 'next/server';

/**
 * Test Axiom connection endpoint
 * POST /api/test-axiom
 */
export async function POST(request: NextRequest) {
  const auditServiceUrl = process.env.AUDIT_SERVICE_URL;
  const auditServiceToken = process.env.AUDIT_SERVICE_TOKEN;

  if (!auditServiceUrl) {
    return NextResponse.json(
      {
        success: false,
        error: 'AUDIT_SERVICE_URL is not configured',
        message: 'Set AUDIT_SERVICE_URL in your .env file',
      },
      { status: 400 }
    );
  }

  if (!auditServiceToken) {
    return NextResponse.json(
      {
        success: false,
        error: 'AUDIT_SERVICE_TOKEN is not configured',
        message: 'Set AUDIT_SERVICE_TOKEN in your .env file',
      },
      { status: 400 }
    );
  }

  // Extract dataset name from URL
  const urlMatch = auditServiceUrl.match(/\/datasets\/([^/]+)\//);
  const datasetName = urlMatch ? urlMatch[1] : 'unknown';

  // Create a test audit entry
  const testEntry = {
    timestamp: new Date().toISOString(),
    userIdHash: 'test',
    ipHash: 'test',
    operation: 'TEST',
    table: 'Test',
    duration: 0,
    success: true,
    retentionDays: 30,
    accessLevel: 'restricted' as const,
  };

  try {
    const startTime = Date.now();
    const res = await fetch(auditServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auditServiceToken}`,
      },
      body: JSON.stringify([testEntry]),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const duration = Date.now() - startTime;

    if (!res.ok) {
      let errorBody = '';
      try {
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const json = await res.json();
          errorBody = JSON.stringify(json);
        } else {
          errorBody = await res.text();
        }
      } catch {
        errorBody = 'Unable to read error response';
      }

      return NextResponse.json(
        {
          success: false,
          status: res.status,
          statusText: res.statusText,
          error: `Axiom API returned error status: ${res.status}`,
          errorBody,
          url: auditServiceUrl,
          datasetName,
          duration,
          suggestions: getErrorSuggestions(res.status, errorBody),
        },
        { status: 500 }
      );
    }

    // Success!
    return NextResponse.json(
      {
        success: true,
        message: 'Axiom connection test successful!',
        url: auditServiceUrl,
        datasetName,
        status: res.status,
        duration,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Log full error for debugging
    console.error('Axiom connection test failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to Axiom',
        errorMessage,
        url: auditServiceUrl,
        datasetName,
        suggestions: getConnectionSuggestions(errorMessage),
      },
      { status: 500 }
    );
  }
}

function getErrorSuggestions(status: number, errorBody: string): string[] {
  const suggestions: string[] = [];

  if (status === 401) {
    suggestions.push('Check your AUDIT_SERVICE_TOKEN - it may be invalid or expired');
    suggestions.push('Get a new token from: https://app.axiom.co/settings/api-tokens');
  } else if (status === 404) {
    suggestions.push('Dataset not found - check that the dataset name in AUDIT_SERVICE_URL is correct');
    suggestions.push('Create the dataset in Axiom first: https://app.axiom.co/datasets');
  } else if (status === 403) {
    suggestions.push('Token may not have permission to write to this dataset');
    suggestions.push('Check token permissions in: https://app.axiom.co/settings/api-tokens');
  } else if (status === 503) {
    suggestions.push('Axiom service is temporarily unavailable - this might be an account/billing issue');
    suggestions.push('Check your Axiom account status: https://app.axiom.co');
  }

  if (errorBody.includes('dataset') || errorBody.includes('not found')) {
    suggestions.push('Verify the dataset name matches exactly in your Axiom account');
  }

  return suggestions;
}

function getConnectionSuggestions(errorMessage: string): string[] {
  const suggestions: string[] = [];

  if (errorMessage.includes('timeout') || errorMessage.includes('ECONNRESET')) {
    suggestions.push('Network connection issue - check your internet connection');
    suggestions.push('Axiom API might be unreachable from your location');
  } else if (errorMessage.includes('fetch')) {
    suggestions.push('Failed to reach Axiom API');
    suggestions.push('Verify the AUDIT_SERVICE_URL is correct: https://api.axiom.co/v1/datasets/{dataset-name}/ingest');
  } else if (errorMessage.includes('AbortSignal')) {
    suggestions.push('Request timed out - Axiom API took too long to respond');
  }

  return suggestions;
}
