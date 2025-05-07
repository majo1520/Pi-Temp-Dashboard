/**
 * Disk Health Utility
 * 
 * This module provides functions to check disk health and usage statistics.
 * It uses the 'disk-space' package to gather information about disk usage,
 * and optionally the 'node-disk-info' package for more detailed drive information.
 */

const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Function to format bytes into human-readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get disk usage using the df command
 * @returns {Promise<Array>} Array of disk information objects
 */
function getDiskUsage() {
  return new Promise((resolve, reject) => {
    // Different command based on OS platform
    const command = os.platform() === 'win32' 
      ? 'wmic logicaldisk get deviceid,freespace,size,volumename'
      : 'df -k';
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Error getting disk usage: ${error.message}`);
        return reject(error);
      }
      
      if (stderr) {
        logger.warn(`Disk usage stderr: ${stderr}`);
      }
      
      try {
        // Parse the output based on platform
        const disks = [];
        
        if (os.platform() === 'win32') {
          // Parse Windows output
          const lines = stdout.trim().split('\n').slice(1); // Skip header
          
          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
              const deviceId = parts[0];
              const freeSpace = parseInt(parts[1], 10) || 0;
              const size = parseInt(parts[2], 10) || 0;
              const volumeName = parts.slice(3).join(' ') || 'Unknown';
              
              if (size > 0) {
                disks.push({
                  filesystem: deviceId,
                  size,
                  used: size - freeSpace,
                  available: freeSpace,
                  capacity: ((size - freeSpace) / size * 100).toFixed(1),
                  mounted: volumeName,
                  sizeFormatted: formatBytes(size),
                  usedFormatted: formatBytes(size - freeSpace),
                  availableFormatted: formatBytes(freeSpace)
                });
              }
            }
          });
        } else {
          // Parse Unix/Linux output
          const lines = stdout.trim().split('\n').slice(1); // Skip header
          
          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 6) {
              const filesystem = parts[0];
              const size = parseInt(parts[1], 10) * 1024; // Convert KB to bytes
              const used = parseInt(parts[2], 10) * 1024; // Convert KB to bytes
              const available = parseInt(parts[3], 10) * 1024; // Convert KB to bytes
              const capacity = parts[4].replace('%', '');
              const mounted = parts[5];
              
              // Skip pseudo filesystems
              if (!filesystem.includes('tmpfs') && 
                  !filesystem.includes('devtmpfs') && 
                  !filesystem.includes('udev') &&
                  parseInt(size, 10) > 0) {
                disks.push({
                  filesystem,
                  size,
                  used,
                  available,
                  capacity,
                  mounted,
                  sizeFormatted: formatBytes(size),
                  usedFormatted: formatBytes(used),
                  availableFormatted: formatBytes(available)
                });
              }
            }
          });
        }
        
        resolve(disks);
      } catch (parseError) {
        logger.error(`Error parsing disk usage output: ${parseError.message}`);
        reject(parseError);
      }
    });
  });
}

/**
 * Get S.M.A.R.T. information for disks if available
 * @returns {Promise<Array>} Array of S.M.A.R.T. information objects
 */
function getSmartInfo() {
  return new Promise((resolve, reject) => {
    // Skip SMART check on Windows or if not available
    if (os.platform() === 'win32') {
      return resolve([]);
    }
    
    // Check if smartctl is available
    exec('which smartctl', (error) => {
      if (error) {
        // smartctl not available, return empty array
        return resolve([]);
      }
      
      // Get list of disks to check
      exec('lsblk -dpno NAME', (error, stdout) => {
        if (error) {
          logger.warn(`Could not get disk list: ${error.message}`);
          return resolve([]);
        }
        
        const disks = stdout.trim().split('\n');
        const smartPromises = disks.map(disk => {
          return new Promise((resolveSmartInfo) => {
            exec(`smartctl -H ${disk}`, (error, stdout) => {
              if (error) {
                // Unable to get SMART info for this disk
                return resolveSmartInfo(null);
              }
              
              // Check for SMART status
              const healthStatusMatch = stdout.match(/SMART overall-health self-assessment test result: (.*)/);
              const healthStatus = healthStatusMatch ? healthStatusMatch[1].trim() : 'Unknown';
              
              resolveSmartInfo({
                device: disk,
                health: healthStatus,
                raw: stdout.trim()
              });
            });
          });
        });
        
        // Resolve all SMART checks and filter out nulls
        Promise.all(smartPromises)
          .then(results => resolve(results.filter(Boolean)))
          .catch(error => {
            logger.error(`Error getting SMART info: ${error.message}`);
            resolve([]);
          });
      });
    });
  });
}

/**
 * Get current I/O statistics for disks
 * @returns {Promise<Object>} Disk I/O statistics
 */
function getDiskIoStats() {
  return new Promise((resolve, reject) => {
    // Skip on Windows
    if (os.platform() === 'win32') {
      return resolve({});
    }
    
    fs.readFile('/proc/diskstats', 'utf8', (error, data) => {
      if (error) {
        logger.warn(`Could not read disk I/O stats: ${error.message}`);
        return resolve({});
      }
      
      const stats = {};
      const lines = data.trim().split('\n');
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 14) {
          const deviceName = parts[2];
          
          // Skip dm- and loop devices
          if (deviceName.startsWith('dm-') || deviceName.startsWith('loop')) {
            return;
          }
          
          stats[deviceName] = {
            reads: parseInt(parts[3], 10),
            readsMerged: parseInt(parts[4], 10),
            sectorsRead: parseInt(parts[5], 10),
            readTime: parseInt(parts[6], 10),
            writes: parseInt(parts[7], 10),
            writesMerged: parseInt(parts[8], 10),
            sectorsWritten: parseInt(parts[9], 10),
            writeTime: parseInt(parts[10], 10),
            ioInProgress: parseInt(parts[11], 10),
            ioTime: parseInt(parts[12], 10),
            weightedIoTime: parseInt(parts[13], 10)
          };
        }
      });
      
      resolve(stats);
    });
  });
}

/**
 * Check for SSD versus HDD drives
 * @returns {Promise<Object>} Information about drives including SSD status
 */
function getDriveTypes() {
  return new Promise((resolve, reject) => {
    // Skip on Windows
    if (os.platform() === 'win32') {
      return resolve({});
    }
    
    exec('lsblk -d -o name,rota', (error, stdout) => {
      if (error) {
        logger.warn(`Could not determine drive types: ${error.message}`);
        return resolve({});
      }
      
      const driveTypes = {};
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const deviceName = parts[0];
          const isRotational = parts[1] === '1';
          
          driveTypes[deviceName] = {
            type: isRotational ? 'HDD' : 'SSD',
            isRotational
          };
        }
      });
      
      resolve(driveTypes);
    });
  });
}

/**
 * Get full disk health and usage information
 * @returns {Promise<Object>} Complete disk health and usage information
 */
async function getDiskHealth() {
  try {
    // Get all disk information in parallel
    const [diskUsage, smartInfo, ioStats, driveTypes] = await Promise.all([
      getDiskUsage(),
      getSmartInfo(),
      getDiskIoStats(),
      getDriveTypes()
    ]);
    
    // Calculate aggregated stats
    const totalSize = diskUsage.reduce((sum, disk) => sum + disk.size, 0);
    const totalUsed = diskUsage.reduce((sum, disk) => sum + disk.used, 0);
    const totalAvailable = diskUsage.reduce((sum, disk) => sum + disk.available, 0);
    const averageCapacity = diskUsage.length > 0 
      ? diskUsage.reduce((sum, disk) => sum + parseFloat(disk.capacity), 0) / diskUsage.length 
      : 0;
    
    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        totalUsed,
        totalUsedFormatted: formatBytes(totalUsed),
        totalAvailable,
        totalAvailableFormatted: formatBytes(totalAvailable),
        averageCapacity: averageCapacity.toFixed(1) + '%',
        diskCount: diskUsage.length,
        healthStatus: smartInfo.every(disk => disk.health === 'PASSED') ? 'HEALTHY' : 'WARNING'
      },
      disks: diskUsage.map(disk => {
        // Try to match with SMART data
        const diskName = path.basename(disk.filesystem);
        const smartData = smartInfo.find(s => s.device.includes(diskName));
        const ioData = ioStats[diskName];
        const driveType = Object.keys(driveTypes).find(d => diskName.includes(d));
        
        return {
          ...disk,
          smart: smartData || null,
          io: ioData || null,
          type: driveType ? driveTypes[driveType].type : 'Unknown'
        };
      }),
      driveTypes,
      raw: {
        smartInfo,
        ioStats
      }
    };
  } catch (error) {
    logger.error(`Error in getDiskHealth: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getDiskHealth,
  getDiskUsage,
  getSmartInfo,
  getDiskIoStats,
  getDriveTypes
}; 