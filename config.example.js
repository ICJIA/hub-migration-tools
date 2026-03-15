export default {
  strapi3: {
    graphqlUrl: process.env.STRAPI3_GRAPHQL_URL || 'http://localhost:1337/graphql',
    apiUrl: process.env.STRAPI3_API_URL || 'http://localhost:1337',
    token: process.env.STRAPI3_TOKEN || '',
  },
  strapi5: {
    graphqlUrl: process.env.STRAPI5_GRAPHQL_URL || 'http://localhost:1338/graphql',
    apiUrl: process.env.STRAPI5_API_URL || 'http://localhost:1338',
    token: process.env.STRAPI5_TOKEN || '',
  },
  strapi3ProjectPath: process.env.STRAPI3_PROJECT_PATH || '../strapi3-project',
  contentTypes: ['article', 'dataset', 'app'],
  paths: {
    schemas: './schemas',
    introspection: './data/introspection',
    output: './output/strapi5-schemas',
    fieldTypeMap: './config/field-type-map.json',
    fieldMap: './config/field-map.json',
  },
};
