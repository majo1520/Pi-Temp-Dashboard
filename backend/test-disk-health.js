/**
 * Test script for disk health utility
 * 
 * Run this script to test the disk health monitoring utility
 * Usage: node test-disk-health.js
 */

const diskHealth = require('./utils/diskHealth');
const logger = require('./utils/logger');

async function testDiskHealth() {
  try {
    logger.info('Testing getDiskUsage()...');
    const diskUsage = await diskHealth.getDiskUsage();
    logger.info('Disk usage results:', diskUsage);
    
    logger.info('\nTesting getSmartInfo()...');
    const smartInfo = await diskHealth.getSmartInfo();
    logger.info('SMART info results:', smartInfo);
    
    logger.info('\nTesting getDiskIoStats()...');
    const ioStats = await diskHealth.getDiskIoStats();
    logger.info('Disk I/O stats results:', ioStats);
    
    logger.info('\nTesting getDriveTypes()...');
    const driveTypes = await diskHealth.getDriveTypes();
    logger.info('Drive types results:', driveTypes);
    
    logger.info('\nTesting full getDiskHealth()...');
    const diskHealthInfo = await diskHealth.getDiskHealth();
    
    logger.info('Disk health summary:');
    logger.info(`- Total size: ${diskHealthInfo.summary.totalSizeFormatted}`);
    logger.info(`- Used space: ${diskHealthInfo.summary.totalUsedFormatted}`);
    logger.info(`- Available space: ${diskHealthInfo.summary.totalAvailableFormatted}`);
    logger.info(`- Average usage: ${diskHealthInfo.summary.averageCapacity}`);
    logger.info(`- Health status: ${diskHealthInfo.summary.healthStatus}`);
    logger.info(`- Number of disks: ${diskHealthInfo.summary.diskCount}`);
    
    // Output disk details
    logger.info('\nDisk details:');
    diskHealthInfo.disks.forEach((disk, index) => {
      logger.info(`\nDisk ${index + 1}: ${disk.filesystem}`);
      logger.info(`- Mounted at: ${disk.mounted}`);
      logger.info(`- Size: ${disk.sizeFormatted}`);
      logger.info(`- Used: ${disk.usedFormatted} (${disk.capacity}%)`);
      logger.info(`- Available: ${disk.availableFormatted}`);
      logger.info(`- Type: ${disk.type}`);
      
      if (disk.smart) {
        logger.info(`- SMART health: ${disk.smart.health}`);
      }
    });
    
    logger.info('\nDisk health test completed successfully.');
  } catch (error) {
    logger.error('Error testing disk health:', error);
  }
}

// Run the test
testDiskHealth(); 