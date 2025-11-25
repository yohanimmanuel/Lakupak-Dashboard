import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

const parseLiteralJSON = (ast: ValueNode): unknown => {
  switch (ast.kind) {
    case Kind.STRING: {
      try {
        return JSON.parse(ast.value);
      } catch {
        return ast.value;
      }
    }
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT: {
      const value: Record<string, unknown> = {};
      for (const field of ast.fields) {
        value[field.name.value] = parseLiteralJSON(field.value);
      }
      return value;
    }
    case Kind.LIST:
      return ast.values.map((valueNode) => parseLiteralJSON(valueNode));
    case Kind.NULL:
    default:
      return null;
  }
};

export const JSONObjectScalar = new GraphQLScalarType({
  name: 'JSONObject',
  description: 'Arbitrary JSON object.',
  serialize(value) {
    return typeof value === 'object' ? value : null;
  },
  parseValue(value) {
    return typeof value === 'object' ? value : null;
  },
  parseLiteral(ast: ValueNode) {
    return parseLiteralJSON(ast);
  },
});

export const baseTypeDefs = /* GraphQL */ `
  scalar JSONObject

  type PaginationInfo {
    page: Int!
    limit: Int!
    totalCount: Int!
    totalPages: Int!
  }

  type Query

  type Mutation
`;

export const baseResolvers = {
  JSONObject: JSONObjectScalar,
};

