// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      visualizer({
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    ],
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom', 'react-i18next', 'i18next'],
            'chart-vendor': ['apexcharts', 'react-apexcharts', 'recharts', 'react-calendar-heatmap'],
            'ui-vendor': ['react-grid-layout', 'react-resizable', 'react-select', 'react-tooltip', 'react-colorful', 'react-datepicker'],
            'data-processing': ['xlsx', 'papaparse', 'file-saver', 'jszip', 'jspdf', 'html2canvas'],
            'mqtt': ['mqtt', 'mqtt-packet'],
            'utils': ['lodash', 'axios', 'dayjs', 'moment'],
            'influxdb': ['@influxdata/influxdb-client'],
          },
        },
      },
    },
    // Ensure base URL is correctly set to work with relative paths
    base: '/',
    server: {
      proxy: {
        '/api': {
          target: 'http://192.168.155.206:5000', 
          changeOrigin: true,
          secure: false,
        },
      },
      host: '0.0.0.0',
    },
  };
});
