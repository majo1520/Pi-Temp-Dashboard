// Test script to debug the database functionality
const { db, locationColors } = require('./db.cjs');

async function testLocationColors() {
  console.log("Testing location colors functionality...");
  
  try {
    // Get all location colors
    console.log("Getting all location colors...");
    const allColors = await locationColors.getAll();
    console.log("Current location colors in the database:", allColors);
    
    // Try updating some colors
    const testColors = {
      ...allColors,
      "TEST": "#FF5500",
      "IT OFFICE": "#0055FF"
    };
    
    console.log("Updating location colors with:", testColors);
    const updateResult = await locationColors.update(testColors);
    console.log("Update result:", updateResult);
    
    // Verify the update
    console.log("Verifying updated colors...");
    const updatedColors = await locationColors.getAll();
    console.log("Updated location colors in the database:", updatedColors);
    
    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Error during test:", error);
  } finally {
    // Close the database connection
    db.close((err) => {
      if (err) console.error("Error closing database:", err);
      else console.log("Database connection closed");
    });
  }
}

// Run the test
testLocationColors(); 