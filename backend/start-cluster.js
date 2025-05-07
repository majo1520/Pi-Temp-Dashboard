/**
 * Cluster Mode Startup Script
 * 
 * This script sets the environment variable to enable cluster mode
 * and then starts the server. Use this instead of directly running server.cjs
 * to enable load balancing across multiple CPU cores.
 */

// Set environment variables
process.env.CLUSTER_MODE = 'true';

// Start the cluster
require('./server.cjs'); 