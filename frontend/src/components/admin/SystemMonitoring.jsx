import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatBytes, formatDuration, getUtilizationColorClass } from '../../utils/formatters';
import * as api from '../../services/api';
import { useTranslation } from 'react-i18next';

// Status indicator component with appropriate colors
const StatusIndicator = ({ status }) => {
  const { t } = useTranslation();
  let bgColor, textColor, icon;
  
  switch (status) {
    case 'healthy':
      bgColor = 'bg-green-100 dark:bg-green-900/30';
      textColor = 'text-green-800 dark:text-green-300';
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
      break;
    case 'warning':
    case 'degraded':
      bgColor = 'bg-yellow-100 dark:bg-yellow-900/30';
      textColor = 'text-yellow-800 dark:text-yellow-300';
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
      break;
    case 'critical':
    case 'error':
      bgColor = 'bg-red-100 dark:bg-red-900/30';
      textColor = 'text-red-800 dark:text-red-300';
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
      break;
    default:
      bgColor = 'bg-blue-100 dark:bg-blue-900/30';
      textColor = 'text-blue-800 dark:text-blue-300';
      icon = (
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
      {icon}
      {t(`monitoring.status.${status}`) || status}
    </span>
  );
};

// Network Section component
const NetworkSection = ({ networkData }) => {
  const { t } = useTranslation();
  
  if (!networkData) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
        <h3 className="text-yellow-800 dark:text-yellow-300 font-medium mb-2">
          {t('monitoring.network.title')}
        </h3>
        <p className="text-yellow-700 dark:text-yellow-400">
          {t('noDataAvailable')}
        </p>
      </div>
    );
  }
  
  const { stats, recentRequests, statusCodes, avgResponseTime } = networkData;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center mb-4">
        <span className="text-xl mr-2">
          <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        </span>
        <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
          {t('monitoring.network.title')}
        </h3>
      </div>
      
      {/* Network Traffic Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
          <div className="text-sm text-blue-700 dark:text-blue-300 mb-1">
            {t('monitoring.network.requestsTotal')}
          </div>
          <div className="text-2xl font-bold text-blue-800 dark:text-blue-300">
            {stats?.requestsTotal || 0}
          </div>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
          <div className="text-sm text-green-700 dark:text-green-300 mb-1">
            {t('monitoring.network.avgResponseTime')}
          </div>
          <div className="text-2xl font-bold text-green-800 dark:text-green-300">
            {avgResponseTime || '0ms'}
          </div>
        </div>
        
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
          <div className="text-sm text-purple-700 dark:text-purple-300 mb-1">
            {t('monitoring.network.traffic')}
          </div>
          <div className="text-lg font-bold text-purple-800 dark:text-purple-300">
            ↓ {stats?.bytesReceivedFormatted || '0 B'} / ↑ {stats?.bytesSentFormatted || '0 B'}
          </div>
        </div>
      </div>
      
      {/* Recent Requests Table */}
      {recentRequests && recentRequests.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
            {t('monitoring.network.recentRequests')}
          </h4>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('monitoring.network.timestamp')}
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('monitoring.network.method')}
                  </th>
                  <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('monitoring.network.path')}
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('monitoring.network.statusCode')}
                  </th>
                  <th className="py-2 px-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('monitoring.network.timeMs')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {recentRequests.map((req, idx) => (
                  <tr key={idx} className="text-sm">
                    <td className="py-2 px-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {req.timestamp ? new Date(req.timestamp).toLocaleTimeString() : ''}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap font-medium text-gray-700 dark:text-gray-300">
                      {req.method}
                    </td>
                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                      {req.path}
                    </td>
                    <td className={`py-2 px-3 text-right whitespace-nowrap font-medium ${
                      req.statusCode < 300 
                        ? 'text-green-600 dark:text-green-400' 
                        : req.statusCode < 400 
                          ? 'text-blue-600 dark:text-blue-400'
                          : req.statusCode < 500
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-red-600 dark:text-red-400'
                    }`}>
                      {req.statusCode}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {req.timeMs}ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Status Code Distribution */}
      {statusCodes && Object.keys(statusCodes).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
            {t('monitoring.network.responseCodeDistribution')}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(statusCodes).map(([code, data]) => (
              <div key={code} className={`p-3 rounded ${
                code.startsWith('2') 
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' 
                  : code.startsWith('3')
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
                    : code.startsWith('4')
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
              }`}>
                <div className="text-xl font-bold">{code}: {data.count}</div>
                <div className="text-sm">Avg: {data.avgTime?.toFixed(2) || 0}ms</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// System Monitoring Dashboard Component
const SystemMonitoring = ({ t: passedT, onClose }) => {
  const { t: rawT, i18n } = useTranslation();
  // Use passed t prop if available, otherwise use the hook
  const t = passedT || rawT;
  
  // Force reload translations when component mounts
  useEffect(() => {
    // Import the reloadTranslations function
    import('../../i18n').then(({ reloadTranslations }) => {
      reloadTranslations();
      console.log('Reloaded translations in SystemMonitoring, current language:', i18n.language);
    });
  }, [i18n]);
  
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [timeRange, setTimeRange] = useState('1h');
  const [networkData, setNetworkData] = useState(null);
  
  // Historical metrics for charts
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [queueHistory, setQueueHistory] = useState([]);
  
  // Add state for disk and memory health data
  const [diskHealthData, setDiskHealthData] = useState(null);
  const [memoryHealthData, setMemoryHealthData] = useState(null);
  
  // Fetch network data
  const fetchNetworkData = async () => {
    try {
      const response = await api.getNetworkStats();
      setNetworkData(response);
    } catch (err) {
      console.error('Error fetching network data:', err);
      // Don't set an error state, just log it
    }
  };
  
  // Fetch disk health data
  const fetchDiskHealthData = async () => {
    try {
      const response = await api.getDiskHealth();
      console.log('Disk health data:', response);
      setDiskHealthData(response);
    } catch (err) {
      console.error('Error fetching disk health data:', err);
      setDiskHealthData(null);
    }
  };
  
  // Fetch memory health data
  const fetchMemoryHealthData = async () => {
    try {
      const response = await api.getMemoryHealth();
      console.log('Memory health data:', response);
      setMemoryHealthData(response);
    } catch (err) {
      console.error('Error fetching memory health data:', err);
      setMemoryHealthData(null);
    }
  };
  
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Get system info
      const systemResponse = await api.getSystemInfo();
      
      // Get health status
      const healthResponse = await api.getHealthStatus();
      
      // Get queue info if available
      let queueResponse = null;
      try {
        queueResponse = await api.getQueueStats();
      } catch (err) {
        console.log('Queue data not available:', err.message);
      }
      
      // Get cache info if available
      let cacheResponse = null;
      try {
        cacheResponse = await api.getCacheStats();
      } catch (err) {
        console.log('Cache data not available:', err.message);
      }
      
      // Get network stats
      await fetchNetworkData();
      
      // Get disk and memory health data
      await fetchDiskHealthData();
      await fetchMemoryHealthData();
      
      // Combine all data
      const combinedData = {
        system: systemResponse,
        health: healthResponse,
        queues: queueResponse,
        cache: cacheResponse,
        timestamp: new Date().toISOString()
      };
      
      setDashboardData(combinedData);
      setLastRefreshed(new Date());
      
      // Update history charts
      const now = new Date();
      
      // CPU usage history
      if (combinedData.system && combinedData.system.cpu) {
        setCpuHistory(prev => {
          const newPoint = {
            time: now.toLocaleTimeString(),
            value: parseFloat(combinedData.system.cpu.utilizationPercent)
          };
          return [...prev.slice(-19), newPoint];
        });
      }
      
      // Memory usage history
      if (combinedData.system && combinedData.system.memory) {
        setMemoryHistory(prev => {
          const newPoint = {
            time: now.toLocaleTimeString(),
            value: parseFloat(combinedData.system.memory.utilizationPercent)
          };
          return [...prev.slice(-19), newPoint];
        });
      }
      
      // Queue stats history
      if (combinedData.queues && combinedData.queues.stats) {
        const queueStats = combinedData.queues.stats;
        const totalJobs = 
          (queueStats.sensor?.waiting || 0) + 
          (queueStats.alerts?.waiting || 0) + 
          (queueStats.aggregation?.waiting || 0);
        
        setQueueHistory(prev => {
          const newPoint = {
            time: now.toLocaleTimeString(),
            value: totalJobs
          };
          return [...prev.slice(-19), newPoint];
        });
      }
      
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load monitoring data. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data load
  useEffect(() => {
    fetchDashboardData();
  }, []);
  
  // Set up refresh interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchDashboardData();
    }, refreshInterval * 1000);
    
    return () => clearInterval(intervalId);
  }, [refreshInterval]);
  
  const handleRefresh = () => {
    fetchDashboardData();
  };
  
  const handleRefreshIntervalChange = (e) => {
    setRefreshInterval(parseInt(e.target.value));
  };
  
  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-700 dark:text-gray-300">
          {t('loadingData') || 'Loading system data...'}
        </span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-lg">
        <h3 className="text-red-800 dark:text-red-300 font-medium mb-2">
          {t('errorOccurred') || 'Error'}
        </h3>
        <p className="text-red-700 dark:text-red-400">{error}</p>
        <button
          className="mt-2 px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded"
          onClick={handleRefresh}
        >
          {t('retryButton') || 'Retry'}
        </button>
      </div>
    );
  }
  
  // Extract data for display
  const systemInfo = dashboardData?.system || {};
  const healthStatus = dashboardData?.health || {};
  const queueInfo = dashboardData?.queues || null;
  const cacheInfo = dashboardData?.cache || null;
  
  return (
    <div>
      {/* Dashboard Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            {t('systemHealthDashboard') || 'System Health Dashboard'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {lastRefreshed ? (
              <span>
                {t('lastUpdated') || 'Last updated'}: {lastRefreshed.toLocaleTimeString()}
              </span>
            ) : (
              <span>{t('loading') || 'Loading...'}</span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <select
            value={refreshInterval}
            onChange={handleRefreshIntervalChange}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-1 text-sm"
          >
            <option value="10">10s</option>
            <option value="30">30s</option>
            <option value="60">1m</option>
            <option value="300">5m</option>
          </select>
          <button
            onClick={handleRefresh}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                {t('refreshing') || 'Refreshing...'}
              </span>
            ) : (
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('refresh') || 'Refresh'}
              </span>
            )}
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title={t('close') || 'Close'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Overall Health Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className={`col-span-3 p-4 rounded-lg border ${
          healthStatus.status === 'healthy' 
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
            : healthStatus.status === 'degraded'
              ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
        }`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-lg font-semibold ${
              healthStatus.status === 'healthy'
                ? 'text-green-800 dark:text-green-300'
                : healthStatus.status === 'degraded'
                  ? 'text-yellow-800 dark:text-yellow-300'
                  : 'text-red-800 dark:text-red-300'
            }`}>
              {t('systemStatus') || 'System Status'}: {healthStatus.status?.toUpperCase()}
            </h3>
            <StatusIndicator status={healthStatus.status || 'unknown'} />
          </div>
          
          {healthStatus.message && (
            <p className="mt-2 text-gray-700 dark:text-gray-300">
              {healthStatus.message}
            </p>
          )}
          
          {/* Service Status Cards */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Node.js Status */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3">
              <div className="flex items-center">
                <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30 mr-3">
                  <svg className="w-6 h-6 text-green-700 dark:text-green-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 1.999c-.512 0-1.017.122-1.478.356L3.277 6.498A2.84 2.84 0 0 0 2 8.999v6.002a2.855 2.855 0 0 0 1.277 2.501l7.245 4.143c.461.234.966.356 1.478.356.512 0 1.017-.122 1.478-.356l7.245-4.143A2.855 2.855 0 0 0 22 15.001V8.999a2.855 2.855 0 0 0-1.277-2.501l-7.245-4.143A2.853 2.853 0 0 0 12 1.999z" fill="currentColor"/>
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">Node.js</h4>
                  <div className="flex items-center">
                    <StatusIndicator status="healthy" />
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {systemInfo.platform?.node || 'v18.x'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Docker Status */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3">
              <div className="flex items-center">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30 mr-3">
                  <svg className="w-6 h-6 text-blue-700 dark:text-blue-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 7h3v3h-3V7zM8 7h3v3H8V7zM3 7h3v3H3V7zM13 12h3v3h-3v-3zM8 12h3v3H8v-3zM13 2h3v3h-3V2zM8 2h3v3H8V2zM3 2h3v3H3V2zM3 12h3v3H3v-3zM18.5 15c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5z" fill="currentColor"/>
                    <path d="M21 19H3v-2h18v2zM2 16.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">Docker</h4>
                  <div className="flex items-center">
                    <StatusIndicator status={systemInfo.docker?.status === 'running' ? 'healthy' : 'warning'} />
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {systemInfo.docker?.containers || '0'} containers
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Database Status */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3">
              <div className="flex items-center">
                <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/30 mr-3">
                  <svg className="w-6 h-6 text-indigo-700 dark:text-indigo-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8c4.42 0 8-1.79 8-4s-3.58-4-8-4-8 1.79-8 4 3.58 4 8 4z" fill="currentColor"/>
                    <path d="M4 6v2c0 2.21 3.58 4 8 4s8-1.79 8-4V6" stroke="currentColor" strokeWidth="2"/>
                    <path d="M4 12v2c0 2.21 3.58 4 8 4s8-1.79 8-4v-2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M4 18v2c0 2.21 3.58 4 8 4s8-1.79 8-4v-2" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">Database</h4>
                  <div className="flex items-center">
                    <StatusIndicator status={systemInfo.database?.status || 'healthy'} />
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {systemInfo.database?.type || 'InfluxDB'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* API Status */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3">
              <div className="flex items-center">
                <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30 mr-3">
                  <svg className="w-6 h-6 text-purple-700 dark:text-purple-300" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 4v16H4V4h16z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M9 12h6m-6-4h6m-6 8h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">API Service</h4>
                  <div className="flex items-center">
                    <StatusIndicator status={systemInfo.api?.status || 'healthy'} />
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      {systemInfo.api?.responseTime || '<100ms'} response
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Health Checks */}
          {healthStatus.checks && healthStatus.checks.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {healthStatus.checks.map((check, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg ${
                    check.status === 'healthy'
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : check.status === 'warning'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30'
                        : 'bg-red-100 dark:bg-red-900/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{check.name}</h4>
                    <StatusIndicator status={check.status} />
                  </div>
                  {check.message && (
                    <p className="text-sm mt-1">{check.message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* System Resources */}
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        {t('systemResources') || 'System Resources'}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* CPU Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center mb-2">
            <span className="text-xl mr-2">
              <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </span>
            <h4 className="text-lg font-medium">{t('cpu') || 'CPU'}</h4>
          </div>
          
          {systemInfo.cpu && (
            <>
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('utilization') || 'Utilization'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {systemInfo.cpu.utilizationPercent}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      parseFloat(systemInfo.cpu.utilizationPercent) > 90
                        ? 'bg-red-500'
                        : parseFloat(systemInfo.cpu.utilizationPercent) > 70
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${systemInfo.cpu.utilizationPercent}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('cores') || 'Cores'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{systemInfo.cpu.cores}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('loadAverage') || 'Load Avg (1m)'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{systemInfo.cpu.loadAvg?.[0]?.toFixed(2) || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('model') || 'Model'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200 truncate max-w-[180px]">{systemInfo.cpu.model || 'N/A'}</span>
                </div>
              </div>
              
              {/* CPU History Chart */}
              {cpuHistory.length > 1 && (
                <div className="mt-4 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cpuHistory}>
                      <XAxis dataKey="time" tick={{fontSize: 10}} />
                      <YAxis domain={[0, 100]} tick={{fontSize: 10}} />
                      <CartesianGrid strokeDasharray="3 3" />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        name="CPU %" 
                        stroke="#2563eb" 
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Memory Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center mb-2">
            <span className="text-xl mr-2">
              <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </span>
            <h4 className="text-lg font-medium">{t('memory') || 'Memory'}</h4>
          </div>
          
          {systemInfo.memory && (
            <>
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('utilization') || 'Utilization'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {systemInfo.memory.utilizationPercent}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      parseFloat(systemInfo.memory.utilizationPercent) > 90
                        ? 'bg-red-500'
                        : parseFloat(systemInfo.memory.utilizationPercent) > 70
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${systemInfo.memory.utilizationPercent}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('total') || 'Total'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{formatBytes(systemInfo.memory.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('used') || 'Used'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{formatBytes(systemInfo.memory.used)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('free') || 'Free'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{formatBytes(systemInfo.memory.free)}</span>
                </div>
              </div>
              
              {/* Memory History Chart */}
              {memoryHistory.length > 1 && (
                <div className="mt-4 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={memoryHistory}>
                      <XAxis dataKey="time" tick={{fontSize: 10}} />
                      <YAxis domain={[0, 100]} tick={{fontSize: 10}} />
                      <CartesianGrid strokeDasharray="3 3" />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        name="Memory %" 
                        stroke="#16a34a" 
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Disk Usage Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center mb-2">
            <span className="text-xl mr-2">
              <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 11.75a2 2 0 100-4 2 2 0 000 4z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.088 3H4.912C3.856 3 3 3.856 3 4.912v14.176C3 20.144 3.856 21 4.912 21h14.176C20.144 21 21 20.144 21 19.088V4.912C21 3.856 20.144 3 19.088 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8.35v-.7m0 8v-.7m4-3.65h.7m-8.7 0h.7" />
              </svg>
            </span>
            <h4 className="text-lg font-medium">{t('monitoring.diskUsage') || 'Disk Usage'}</h4>
          </div>
          
          {/* Use diskHealthData if available, otherwise fall back to systemInfo.disk */}
          {(diskHealthData || systemInfo.disk) ? (
            <>
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('utilization') || 'Utilization'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {diskHealthData?.summary?.averageCapacity || systemInfo.disk?.utilizationPercent || 0}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      parseFloat(diskHealthData?.summary?.averageCapacity || systemInfo.disk?.utilizationPercent || 0) > 90
                        ? 'bg-red-500'
                        : parseFloat(diskHealthData?.summary?.averageCapacity || systemInfo.disk?.utilizationPercent || 0) > 70
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${parseFloat(diskHealthData?.summary?.averageCapacity || systemInfo.disk?.utilizationPercent || 0)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('total') || 'Total'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {diskHealthData?.summary?.totalSizeFormatted || formatBytes(systemInfo.disk?.total || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('used') || 'Used'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {diskHealthData?.summary?.totalUsedFormatted || formatBytes(systemInfo.disk?.used || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('free') || 'Free'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {diskHealthData?.summary?.totalAvailableFormatted || formatBytes(systemInfo.disk?.free || 0)}
                  </span>
                </div>
                
                {/* Show disk health status if available */}
                {(diskHealthData?.summary?.healthStatus || systemInfo.disk?.health) && (
                  <div className="flex justify-between mt-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{t('health') || 'Health'}</span>
                    <span className={`text-sm font-medium ${
                      (diskHealthData?.summary?.healthStatus === 'HEALTHY' || systemInfo.disk?.health === 'good') ? 'text-green-600 dark:text-green-400' :
                      (diskHealthData?.summary?.healthStatus === 'WARNING' || systemInfo.disk?.health === 'warning') ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {(diskHealthData?.summary?.healthStatus === 'HEALTHY' || systemInfo.disk?.health === 'good') ? t('healthy') || 'Healthy' :
                       (diskHealthData?.summary?.healthStatus === 'WARNING' || systemInfo.disk?.health === 'warning') ? t('warning') || 'Warning' : 
                       t('critical') || 'Critical'}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Disk partitions if available */}
              {(diskHealthData?.disks?.length > 0 || systemInfo.disk?.partitions?.length > 0) && (
                <div className="mt-4">
                  <h5 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    {t('partitions') || 'Partitions'}
                  </h5>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('mount') || 'Mount'}
                          </th>
                          <th className="px-2 py-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('size') || 'Size'}
                          </th>
                          <th className="px-2 py-1 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            {t('used') || 'Used'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {(diskHealthData?.disks || systemInfo.disk?.partitions || []).map((partition, idx) => (
                          <tr key={idx} className="text-sm">
                            <td className="px-2 py-1 whitespace-nowrap text-gray-700 dark:text-gray-300">
                              {partition.mounted || partition.mount}
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap text-gray-700 dark:text-gray-300">
                              {partition.sizeFormatted || formatBytes(partition.size)}
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end">
                                <span className={`mr-2 ${
                                  parseFloat(partition.capacity || partition.usedPercent || 0) > 90
                                    ? 'text-red-600 dark:text-red-400'
                                    : parseFloat(partition.capacity || partition.usedPercent || 0) > 70
                                      ? 'text-yellow-600 dark:text-yellow-400'
                                      : 'text-green-600 dark:text-green-400'
                                }`}>
                                  {partition.capacity || partition.usedPercent || 0}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <p>{t('diskInfoNotAvailable') || 'Disk information not available'}</p>
              <button 
                onClick={fetchDiskHealthData} 
                className="mt-2 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded"
              >
                {t('tryAgain') || 'Try Again'}
              </button>
            </div>
          )}
        </div>
        
        {/* Uptime & System Info Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center mb-2">
            <span className="text-xl mr-2">
              <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h4 className="text-lg font-medium">{t('uptime') || 'Uptime & Info'}</h4>
          </div>
          
          {systemInfo.uptime && (
            <div className="mb-4">
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('systemUptime') || 'System Uptime'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{formatDuration(systemInfo.uptime.system)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('processUptime') || 'Process Uptime'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{formatDuration(systemInfo.uptime.process)}</span>
                </div>
              </div>
            </div>
          )}
          
          {systemInfo.platform && (
            <div className="mt-4">
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('platformInfo') || 'Platform Info'}
              </h5>
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('os') || 'OS'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{systemInfo.platform.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('arch') || 'Architecture'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{systemInfo.platform.arch}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('node') || 'Node.js'}</span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">{systemInfo.platform.node}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Add Network Section */}
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200 mt-6">
        {t('monitoring.networkTitle') || 'Network Monitoring'}
      </h3>
      
      <div className="mb-6">
        <NetworkSection networkData={systemInfo.network} />
      </div>
      
      {/* Queue and Cache Section */}
      <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        {t('servicesStatus') || 'Services Status'}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Queue Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center">
              <span className="text-xl mr-2">
                <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </span>
              <h4 className="text-lg font-medium">{t('queueStatus') || 'Queue Status'}</h4>
            </div>
          
            {queueInfo ? (
                <div className="mt-4">
                  <p className="mb-2 text-sm text-gray-700 dark:text-gray-300">
                    {t('queueRunningMode') || 'Running mode'}: <strong>{queueInfo.mode === 'redis' ? 'Redis' : 'In-memory'}</strong>
                  </p>
                  
                  {queueInfo.stats && (
                    <div className="mt-2">
                      <h5 className="text-sm font-medium mb-2">{t('queueStats') || 'Queue Statistics'}</h5>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead>
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t('queue') || 'Queue'}
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t('waiting') || 'Waiting'}
                              </th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {t('active') || 'Active'}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {Object.entries(queueInfo.stats).map(([queueName, stats]) => (
                              <tr key={queueName}>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                  {queueName}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-right">
                                  {stats.waiting || 0}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 text-right">
                                  {stats.active || 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {/* Queue History Chart */}
                  {queueHistory.length > 1 && (
                    <div className="mt-4 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={queueHistory}>
                          <XAxis dataKey="time" tick={{fontSize: 10}} />
                          <YAxis tick={{fontSize: 10}} />
                          <CartesianGrid strokeDasharray="3 3" />
                          <Tooltip />
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            name="Jobs" 
                            stroke="#9333ea" 
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
            ) : (
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 rounded">
                {t('queueUnavailable') || 'Queue service is not available. This may affect sensor data processing.'}
              </div>
            )}
        </div>
        
        {/* Cache Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-xl mr-2">
                <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </span>
              <h4 className="text-lg font-medium">{t('cacheStatus') || 'Cache Status'}</h4>
            </div>
            {cacheInfo ? (
              <StatusIndicator status="healthy" />
            ) : (
              <StatusIndicator status="warning" />
            )}
          </div>
          
          {cacheInfo ? (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {cacheInfo.stats.hits || 0}
                  </div>
                  <div className="text-sm text-blue-600 dark:text-blue-400">
                    {t('cacheHits') || 'Cache Hits'}
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded">
                  <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                    {cacheInfo.stats.misses || 0}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {t('cacheMisses') || 'Cache Misses'}
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('hitRatio') || 'Hit Ratio'}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {cacheInfo.stats.hitRatio ? (cacheInfo.stats.hitRatio * 100).toFixed(1) + '%' : 'N/A'}
                  </span>
                </div>
                {cacheInfo.stats.hitRatio !== undefined && (
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${cacheInfo.stats.hitRatio * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
              
              <div className="mt-4">
                <h5 className="text-sm font-medium mb-2">{t('cacheKeys') || 'Cached Items'}</h5>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {t('totalKeys') || 'Total keys'}: <strong>{cacheInfo.keyCount || 0}</strong>
                </div>
                
                {cacheInfo.sampleKeys && cacheInfo.sampleKeys.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {t('sampleKeys') || 'Sample keys'}:
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 p-2 rounded max-h-24 overflow-y-auto">
                      {cacheInfo.sampleKeys.map((key, index) => (
                        <div key={index} className="text-xs text-gray-700 dark:text-gray-300 truncate">
                          {key}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 rounded">
              {t('cacheUnavailable') || 'Cache service is not available. This may impact performance.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemMonitoring; 