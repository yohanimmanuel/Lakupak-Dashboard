export const mergeTypeDefs = (typeDefs: string[]): string =>
  typeDefs
    .filter(Boolean)
    .map((typedef) => typedef.trim())
    .join('\n\n');

