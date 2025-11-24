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
  const response = await fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}`);
  }

  let payload: GraphQLResponse<T>;
  try {
    payload = (await response.json()) as GraphQLResponse<T>;
  } catch (error) {
    throw new Error('Failed to parse GraphQL response');
  }

  if (payload.errors && payload.errors.length > 0) {
    const aggregated = payload.errors.map((err) => err.message).join('; ');
    throw new Error(aggregated || 'GraphQL request returned errors');
  }

  if (!payload.data) {
    throw new Error('GraphQL request returned no data');
  }

  return payload.data;
}

