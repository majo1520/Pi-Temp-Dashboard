# API Documentation and Code Documentation

This document describes the approach taken to document the codebase, including the implementation of Swagger/OpenAPI documentation for the REST API and JSDoc for code documentation.

## REST API Documentation with Swagger/OpenAPI

The IoT Dashboard provides comprehensive API documentation using the OpenAPI 3.0 specification (Swagger). This allows developers to explore and understand the API endpoints, their parameters, request/response schemas, and authentication requirements.

### Accessing the API Documentation

When the server is running, you can access the Swagger UI at:

```
http://localhost:5000/api/docs
```

The documentation is also available in raw JSON format at:

```
http://localhost:5000/api/docs.json
```

### How the API Documentation Works

1. **Configuration**: The Swagger configuration is defined in `backend/swagger.js`.
2. **Integration**: The Swagger middleware is integrated into the Express server in `backend/server.cjs`.
3. **Documentation**: Individual API routes are documented using JSDoc-style comments in their respective files (e.g., `routes/sensors.js`).

### Example API Documentation

Here's an example of how an API endpoint is documented:

```javascript
/**
 * @swagger
 * /api/sensors/{name}/history:
 *   get:
 *     summary: Get historical data for a sensor
 *     description: Retrieves historical time-series data for a specific sensor
 *     tags: [Sensors]
 *     parameters:
 *       - in: path
 *         name: name
 *         schema:
 *           type: string
 *         required: true
 *         description: Sensor name/location
 *     responses:
 *       200:
 *         description: Historical sensor data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SensorReading'
 */
```

## Code Documentation with JSDoc

In addition to the API documentation, the codebase is documented using JSDoc comments. This makes the code more maintainable and helps developers understand how different components work and interact.

### Frontend Components

React components are documented using JSDoc with the `@component` tag:

```javascript
/**
 * @module components/admin/SensorRow
 * @description Component for displaying sensor data in the admin panel table
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.sensor - Sensor data object
 * @param {string} props.sensor.name - Sensor name/identifier
 * @returns {JSX.Element} The sensor row component
 */
```

### Custom Hooks

Custom hooks are documented with detailed descriptions of their purpose and return values:

```javascript
/**
 * Custom hook for managing sensor data and operations
 * 
 * @returns {Object} An object containing properties and methods
 * @returns {Array} sensors - Array of sensor objects
 * @returns {boolean} isRefreshing - Whether a refresh operation is in progress
 */
```

### Utility Functions

Utility functions are documented with parameters and return values:

```javascript
/**
 * Format duration in human-readable format
 * 
 * @param {number} ms - Duration in milliseconds
 * @returns {string|null} Formatted duration string or null if no duration provided
 */
```

## Benefits of Documentation

1. **Discoverability**: Makes it easier to understand the API and codebase
2. **Onboarding**: Helps new developers quickly understand how things work
3. **Maintenance**: Simplifies future updates and refactoring
4. **Testing**: Provides clear specifications for endpoint behavior
5. **Integration**: Makes it easier for third-party developers to use the API

## Documentation Workflow

When making changes to the codebase:

1. Update Swagger documentation for any changes to API endpoints
2. Update JSDoc comments for new or modified components, hooks, or functions
3. Ensure documentation matches actual behavior

Documentation should be treated as an integral part of the codebase, not an afterthought, and should be updated as part of any code changes.

## Changelog

- **June 2024**: Frontend now displays a sensor's IP address in the admin panel details (if available in the API response as `ipAddress`).
  If the backend is extended to provide this field, it will be shown in the UI. The `ipAddress` field is now documented as optional in the `SensorStatus` schema. 