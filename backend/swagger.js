/**
 * Swagger/OpenAPI configuration file
 * This module sets up the OpenAPI documentation for the IoT Dashboard API
 * with fallback handling for missing dependencies
 */

let swaggerJSDoc;
let swaggerUi;

// Try to load the swagger dependencies, but don't fail if they're not available
try {
  swaggerJSDoc = require('swagger-jsdoc');
  swaggerUi = require('swagger-ui-express');
} catch (error) {
  console.warn('Swagger dependencies not found. API documentation will be limited.');
  console.warn('To enable full API documentation, install: npm install swagger-jsdoc swagger-ui-express --save');
}

// Default swagger specification
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'IoT Sensor Dashboard API',
    version: '1.0.0',
    description: 'API documentation for the IoT Sensor Dashboard',
    license: {
      name: 'ISC',
      url: 'https://opensource.org/licenses/ISC',
    },
    contact: {
      name: 'Support',
      email: 'support@example.com',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      sessionAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'dashboard.sid',
        description: 'Session authentication cookie',
      },
    },
  },
  security: [
    {
      sessionAuth: [],
    },
  ],
  tags: [
    {
      name: 'Auth',
      description: 'Authentication and authorization endpoints',
    },
    {
      name: 'Sensors',
      description: 'Endpoints for sensor data and management',
    },
    {
      name: 'Settings',
      description: 'User and system settings',
    },
    {
      name: 'Export',
      description: 'Data export functionalities',
    },
    {
      name: 'Import',
      description: 'Data import functionalities',
    },
    {
      name: 'Users',
      description: 'User management endpoints',
    },
    {
      name: 'Telegram',
      description: 'Telegram notification integration',
    },
    {
      name: 'Colors',
      description: 'Location color settings',
    },
  ],
};

// Generate swagger specification
let swaggerSpec;

if (swaggerJSDoc) {
  // If swagger-jsdoc is available, use it to generate the full spec
  const options = {
    swaggerDefinition,
    apis: [
      './routes/*.js',
      './server.cjs',
      './middleware/*.js',
    ],
  };
  
  try {
    swaggerSpec = swaggerJSDoc(options);
  } catch (error) {
    console.error('Error generating Swagger documentation:', error);
    swaggerSpec = { ...swaggerDefinition, paths: {} };
  }
} else {
  // If swagger-jsdoc is not available, use a minimal spec
  swaggerSpec = { ...swaggerDefinition, paths: {} };
}

// Setup swagger middleware
const setup = (app) => {
  // Serve swagger spec as JSON regardless of dependencies
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  // Only set up Swagger UI if dependencies are available
  if (swaggerUi) {
    try {
      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'IoT Dashboard API Documentation',
      }));
      console.log('Swagger documentation available at /api/docs');
    } catch (error) {
      console.error('Error setting up Swagger UI:', error);
      provideFallbackDocs(app);
    }
  } else {
    provideFallbackDocs(app);
  }
};

// Provide a fallback documentation page when Swagger UI is not available
function provideFallbackDocs(app) {
  app.get('/api/docs', (req, res) => {
    res.send(`
      <html>
        <head>
          <title>API Documentation</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
            h1 { color: #333; }
            pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>API Documentation</h1>
          <p>Swagger UI is not currently available. The required packages are not installed:</p>
          <pre>npm install swagger-jsdoc swagger-ui-express --save</pre>
          <p>You can still access the raw OpenAPI specification at: <a href="/api/docs.json">/api/docs.json</a></p>
        </body>
      </html>
    `);
  });
  console.log('Limited API documentation available at /api/docs');
}

module.exports = { setup, swaggerSpec }; 