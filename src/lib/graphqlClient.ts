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

  let payload: GraphQLResponse<T>;
  try {
    payload = (await response.json()) as GraphQLResponse<T>;
  } catch (error) {
    // If response is not ok, try to get error message from response
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`GraphQL request failed with status ${response.status}: ${errorText}`);
    }
    throw new Error('Failed to parse GraphQL response');
  }

  // Check for GraphQL errors first (even if status is 200)
  if (payload.errors && payload.errors.length > 0) {
    const aggregated = payload.errors.map((err) => err.message).join('; ');
    throw new Error(aggregated || 'GraphQL request returned errors');
  }

  // Check HTTP status after parsing (GraphQL can return 200 with errors)
  if (!response.ok) {
    const errorMessage = payload.errors?.[0]?.message || `GraphQL request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  if (!payload.data) {
    throw new Error('GraphQL request returned no data');
  }

  return payload.data;
}

