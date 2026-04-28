import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EduWins API Documentation',
      version: '1.0.0',
      description: 'API documentation for the EduWins backend platform.',
    },
    servers: [
      {
        url: 'http://localhost:5002/api',
        description: 'Development Server (API Base Path)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Matches route files to parse JSDoc comments automatically
  apis: ['./routes/*.ts'], 
};

export const swaggerSpec = swaggerJSDoc(options);
