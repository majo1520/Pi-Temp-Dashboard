/**
 * OpenTelemetry Tracing Setup
 * 
 * This module configures OpenTelemetry for distributed tracing
 * across the application.
 */

const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

const logger = require('../utils/logger');

let sdk;
let initialized = false;

/**
 * Initialize OpenTelemetry
 * @param {Object} config - Configuration options
 */
function initTracing(config = {}) {
  if (initialized) return;
  
  try {
    const traceExporterOptions = {
      url: config.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      headers: {},
    };

    const traceExporter = new OTLPTraceExporter(traceExporterOptions);
    
    // Create and configure SDK
    sdk = new opentelemetry.NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'dashboard-backend',
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      }),
      spanProcessor: new opentelemetry.tracing.BatchSpanProcessor(traceExporter),
      instrumentations: [
        // Auto-instruments well-known modules
        getNodeAutoInstrumentations({
          // Disable some instrumentations if needed
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
        // Add additional instrumentations
        new ExpressInstrumentation(),
        new HttpInstrumentation(),
        new RedisInstrumentation(),
      ],
    });
    
    // Initialize the SDK and register with the OpenTelemetry API
    sdk.start()
      .then(() => {
        logger.log('OpenTelemetry tracing initialized');
        initialized = true;
      })
      .catch(error => {
        logger.error('Error initializing OpenTelemetry:', error);
      });
    
    // Handle shutdown gracefully
    process.on('SIGTERM', () => {
      gracefulShutdown();
    });
    
    process.on('SIGINT', () => {
      gracefulShutdown();
    });
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry:', error);
  }
}

/**
 * Gracefully shut down the OpenTelemetry SDK
 */
function gracefulShutdown() {
  if (sdk) {
    sdk.shutdown()
      .then(() => {
        logger.log('OpenTelemetry SDK shut down successfully');
      })
      .catch(error => {
        logger.error('Error shutting down OpenTelemetry SDK:', error);
      })
      .finally(() => {
        initialized = false;
      });
  }
}

/**
 * Create a custom span for a specific operation
 * @param {string} name - Name of the span
 * @param {function} operation - Function to execute within the span
 * @param {Object} attributes - Additional attributes to add to the span
 * @returns {Promise<any>} - Result of the operation
 */
async function createSpan(name, operation, attributes = {}) {
  const tracer = trace.getTracer('dashboard-backend');
  
  return await tracer.startActiveSpan(name, async (span) => {
    try {
      // Add attributes to the span
      span.setAttributes(attributes);
      
      // Execute the operation
      const result = await operation();
      
      // End the span
      span.end();
      
      return result;
    } catch (error) {
      // Record error and end span
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      span.end();
      
      // Re-throw the error
      throw error;
    }
  });
}

/**
 * Express middleware to add route information to the current span
 */
function tracingMiddleware(req, res, next) {
  const currentSpan = trace.getSpan(context.active());
  if (currentSpan) {
    currentSpan.setAttributes({
      'http.route': req.route ? req.route.path : req.path,
      'http.request.method': req.method,
      'http.request.headers': JSON.stringify(req.headers),
      'http.request.query': JSON.stringify(req.query),
      'user.id': req.session?.user?.id || 'anonymous',
    });
  }
  next();
}

module.exports = {
  initTracing,
  createSpan,
  tracingMiddleware,
  gracefulShutdown
}; 