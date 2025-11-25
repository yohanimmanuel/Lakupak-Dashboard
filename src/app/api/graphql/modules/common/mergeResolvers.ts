type ResolverMap = Record<string, unknown>;

export const mergeResolvers = (resolverMaps: ResolverMap[]): ResolverMap => {
  const target: ResolverMap = {};

  for (const resolvers of resolverMaps) {
    for (const [key, value] of Object.entries(resolvers)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        target[key] = mergeResolvers([
          (target[key] as ResolverMap) || {},
          value as ResolverMap,
        ]);
      } else {
        target[key] = value;
      }
    }
  }

  return target;
};

