type GraphQLError = {
  message: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

export async function fetchGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  // Remove null and undefined values from variables to avoid GraphQL validation errors
  const cleanVariables = variables ? Object.fromEntries(
    Object.entries(variables).filter(([_, value]) => value !== null && value !== undefined)
  ) : undefined;

  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: cleanVariables }),
  });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`GraphQL request failed with status ${response.status}: ${errorText}`);
    }

  const responseText = await response.text();
  if (!responseText || responseText.trim().length === 0) {
    throw new Error('Empty response from GraphQL server');
  }

  let payload: GraphQLResponse<T>;
  try {
    payload = JSON.parse(responseText) as GraphQLResponse<T>;
  } catch (parseError) {
    throw new Error('Failed to parse GraphQL response: Invalid JSON format');
  }

  // Check for GraphQL errors first (even if status is 200)
  if (payload.errors && payload.errors.length > 0) {
    const aggregated = payload.errors.map((err) => err.message).join('; ');
    throw new Error(aggregated || 'GraphQL request returned errors');
  }

  if (!payload.data) {
    throw new Error('GraphQL request returned no data');
  }

  return payload.data;
}

