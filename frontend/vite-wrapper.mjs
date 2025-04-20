// vite-wrapper.mjs - ES Module wrapper for Vite
import { createServer } from 'vite';

// Create and start the development server
async function startServer() {
  try {
    const server = await createServer({
      // Vite will automatically load config from vite.config.js
      configFile: './vite.config.js',
      root: process.cwd(),
      server: {
        port: 5173,
        strictPort: false,
        host: true, // Listen on all addresses
      }
    });
    
    await server.listen();
    
    // Output server URLs
    server.printUrls();
    
    // Handle graceful shutdown
    const exitProcess = () => {
      server.close().then(() => process.exit());
    };
    
    process.on('SIGINT', exitProcess);
    process.on('SIGTERM', exitProcess);
    
  } catch (error) {
    console.error('Error starting Vite server:', error);
    process.exit(1);
  }
}

startServer(); 