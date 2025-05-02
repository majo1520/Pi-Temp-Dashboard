// logger.js
const { LOGGING_LEVEL } = require('../config/config');

// Configurable logging utility
const logger = {
  // Possible values: 'ALL', 'ERROR', 'NONE'
  level: LOGGING_LEVEL,
  
  log: function(...args) {
    if (this.level === 'ALL') {
      console.log(...args);
    }
  },
  
  error: function(...args) {
    if (this.level === 'ALL' || this.level === 'ERROR') {
      console.error(...args);
    }
  },
  
  // Always log regardless of configuration (for critical messages)
  always: function(...args) {
    console.log(...args);
  }
};

module.exports = logger; 