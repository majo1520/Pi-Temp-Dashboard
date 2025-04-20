// build-wrapper.mjs - ES Module wrapper for Vite build
import { build } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Run the build process
async function runBuild() {
  try {
    console.log('Starting Vite build process...');
    
    // Get build mode from arguments
    const isProd = process.argv.includes('--mode=production');
    const mode = isProd ? 'production' : 'development';
    
    console.log(`Building for ${mode} mode`);
    
    await build({
      configFile: resolve(__dirname, 'vite.config.js'),
      root: __dirname,
      mode: mode
    });
    
    console.log('Build completed successfully!');
    
  } catch (error) {
    console.error('Error during Vite build:', error);
    process.exit(1);
  }
}

runBuild(); 