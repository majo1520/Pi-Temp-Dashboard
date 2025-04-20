// Test script to verify database functionality
const { userSettings, closeDatabase } = require('./db.cjs');

async function testUserSettings() {
  console.log("Testing user settings functionality...");
  
  try {
    // Get default admin user settings
    const userId = 1; // Assuming admin is first user
    
    // Test saving and retrieving thresholds
    const testThresholds = {
      temperature: {
        min: 15,
        max: 30,
        warningMin: 18,
        warningMax: 25
      }
    };
    
    console.log("Setting test thresholds for user:", userId);
    await userSettings.set(userId, 'thresholds', testThresholds);
    
    console.log("Getting thresholds for user:", userId);
    const savedThresholds = await userSettings.get(userId, 'thresholds');
    console.log("Retrieved thresholds:", savedThresholds);
    
    console.log("Getting all settings for user:", userId);
    const allSettings = await userSettings.getAll(userId);
    console.log("All user settings:", allSettings);
    
    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Error during test:", error);
  } finally {
    // Close the database connection properly
    try {
      await closeDatabase();
      console.log("Database connection closed successfully");
    } catch (err) {
      console.error("Error closing database:", err);
    }
  }
}

// Run the test
testUserSettings(); 