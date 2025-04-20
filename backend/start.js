// Server startup script with proper error handling
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to start the server
function startServer() {
  console.log('Starting server...');
  
  // Path to server.cjs
  const serverPath = path.join(__dirname, 'server.cjs');
  
  // Check if server file exists
  if (!fs.existsSync(serverPath)) {
    console.error(`ERROR: Server file not found: ${serverPath}`);
    process.exit(1);
  }
  
  console.log(`Using server file: ${serverPath}`);
  
  // Spawn the server process with additional debugging flags
  const server = spawn('node', ['--trace-warnings', serverPath], {
    stdio: 'inherit', // Pipe stdio to parent process
    detached: false,   // Don't detach the process
    env: {
      ...process.env,
      DEBUG: 'express:*',  // Enable Express debugging
    }
  });
  
  // Handle server process events
  server.on('error', (error) => {
    console.error('Failed to start server:', error);
  });
  
  server.on('exit', (code, signal) => {
    console.log(`Server exited with code ${code} and signal ${signal}`);
    
    if (code !== 0 && !signal) {
      console.log('Server crashed, restarting in 5 seconds...');
      setTimeout(startServer, 5000);
    } else if (code === 0) {
      console.log('Server stopped normally. Not restarting.');
      // The server might be exiting on purpose, investigate why it exits with code 0
    }
  });
  
  // Handle process signals
  process.on('SIGINT', () => {
    console.log('SIGINT received, stopping server...');
    server.kill('SIGINT');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping server...');
    server.kill('SIGTERM');
    process.exit(0);
  });
}

// Start the server
startServer(); 