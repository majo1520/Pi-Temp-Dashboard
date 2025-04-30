import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, UNSAFE_DataRouterContext, UNSAFE_DataRouterStateContext, createRoutesFromChildren } from 'react-router-dom';
import './index.css';
import LoadingIndicator from './components/LoadingIndicator';
import ProtectedRoute from './ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Import moment.js and Slovak locale
import moment from 'moment';
import 'moment/locale/sk'; // Import Slovak locale

// Import i18n configuration
import './i18n';

// Initialize moment with Slovak locale support
moment.locale('sk'); // This sets default, will be overridden as needed

// Import logger utilities
import './utils/toggleLogs';
import logger from './utils/logger';

// Import and initialize fetch interceptor for error suppression
import { initFetchInterceptor } from './utils/fetchInterceptor';
initFetchInterceptor();

// Import and initialize console interceptor
import { initConsoleInterceptor } from './utils/consoleInterceptor';
initConsoleInterceptor();

// Set future flags to silence warnings
// This needs to be done before any Router related components are rendered
window.__reactRouterVersion = { major: 6, minor: 21, patch: 3 };
window.__reactRouterFuture = { 
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

// Log startup message (will only show if logs are enabled)
logger.log('🚀 Application starting up...');

// Lazy load main app components
const App = lazy(() => import('./App').then(module => ({ default: module.App })));
const AdminPanel = lazy(() => import('./AdminPanel'));
const LoginPage = lazy(() => import('./LoginPage'));

// Create fallback loading state
const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100">
    <LoadingIndicator size="large" text="Načítavam aplikáciu..." />
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin/*" element={
              <ProtectedRoute>
                <AdminPanel />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={<App />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
