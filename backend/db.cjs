// db.cjs - SQLite Database Module
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const betterSqlite3 = require('better-sqlite3');

// Database file path
const DB_PATH = path.join(__dirname, 'dashboard.db');
const DB_DIR = path.dirname(DB_PATH);

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Implement connection pooling for better performance
// We'll use better-sqlite3 for the main connection which is faster than sqlite3,
// and create a small pool for parallel operations
const MAX_POOL_SIZE = 5;
const connectionPool = [];
let poolIndex = 0;

// Initialize connection pool
function initConnectionPool() {
  console.log(`Initializing SQLite connection pool with ${MAX_POOL_SIZE} connections...`);
  
  for (let i = 0; i < MAX_POOL_SIZE; i++) {
    try {
      const connection = new betterSqlite3(DB_PATH, {
        // fileMustExist: false, // Create if not exists
        readonly: false,
        timeout: 5000 // 5 seconds timeout
      });
      
      // Enable foreign keys for each connection
      connection.pragma('foreign_keys = ON');
      
      // Add connection to pool
      connectionPool.push(connection);
      
    } catch (err) {
      console.error(`Error creating pooled connection #${i}:`, err.message);
    }
  }
  
  console.log(`Connection pool initialized with ${connectionPool.length} connections`);
}

// Get connection from pool with round-robin distribution
function getConnection() {
  if (connectionPool.length === 0) {
    throw new Error('Connection pool is empty');
  }
  
  // Use round-robin to distribute connections
  const connection = connectionPool[poolIndex];
  poolIndex = (poolIndex + 1) % connectionPool.length;
  
  return connection;
}

// For compatibility with existing code that uses the sqlite3 API
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
    // Initialize connection pool after database is set up
    initConnectionPool();
  }
});

// Initialize database schema
function initializeDatabase() {
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) console.error('Error enabling foreign keys:', err.message);
  });

  // Create tables with better validation and constraints
  const tables = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL CHECK(length(username) >= 3),
      password_hash TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP,
      last_login TIMESTAMP,
      active BOOLEAN DEFAULT 1 CHECK(active IN (0, 1))
    )`,
    
    // Roles table
    `CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    )`,
    
    // User roles mapping table
    `CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER,
      role_id INTEGER,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    )`,
    
    // Location colors table
    `CREATE TABLE IF NOT EXISTS location_colors (
      location TEXT PRIMARY KEY,
      color TEXT NOT NULL CHECK(color LIKE '#%'),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // User settings table - stores thresholds and other user-specific settings
    `CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, setting_key)
    )`
  ];

  // Create tables
  db.serialize(() => {
    tables.forEach(table => {
      db.run(table, (err) => {
        if (err) console.error('Error creating table:', err.message);
      });
    });

    // Insert default roles if they don't exist
    const roles = [
      { name: 'admin', description: 'Administrator with full access' },
      { name: 'user', description: 'Regular user with limited access' },
      { name: 'viewer', description: 'View-only access' }
    ];

    const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)');
    roles.forEach(role => {
      insertRole.run(role.name, role.description);
    });
    insertRole.finalize();

    // Add the custom super admin account if it doesn't exist
    db.get('SELECT id FROM users WHERE email = ?', ['m.barat@europlac.com'], (err, row) => {
      if (err) {
        console.error('Error checking for super admin:', err.message);
        return;
      }

      if (!row) {
        // Create custom super admin
        bcrypt.hash('Europlac1', 10, (err, hash) => {
          if (err) {
            console.error('Error hashing super admin password:', err.message);
            return;
          }

          db.run(
            'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
            ['admin', hash, 'm.barat@europlac.com'],
            function(err) {
              if (err) {
                console.error('Error creating super admin user:', err.message);
                return;
              }

              // Assign admin role to the super admin
              db.run(
                'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?',
                [this.lastID, 'admin'],
                (err) => {
                  if (err) console.error('Error assigning admin role to super admin:', err.message);
                  else console.log('Created super admin user with email: m.barat@europlac.com');
                }
              );
            }
          );
        });
      }
    });

    // Insert a default admin user if no users exist
    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
      if (err) {
        console.error('Error checking users:', err.message);
        return;
      }

      if (row.count === 0) {
        // Create default admin user with password 'admin'
        const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
        bcrypt.hash(defaultPassword, 10, (err, hash) => {
          if (err) {
            console.error('Error hashing password:', err.message);
            return;
          }

          db.run(
            'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
            ['admin', hash, 'admin@example.com'],
            function(err) {
              if (err) {
                console.error('Error creating default admin user:', err.message);
                return;
              }

              // Assign admin role to the user
              db.run(
                'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?',
                [this.lastID, 'admin'],
                (err) => {
                  if (err) console.error('Error assigning admin role:', err.message);
                  else console.log('Created default admin user with password:', defaultPassword);
                }
              );
            }
          );
        });
      }
    });

    // Import existing location colors if they exist
    const LOCATION_COLORS_FILE = path.join(__dirname, 'location_colors.json');
    if (fs.existsSync(LOCATION_COLORS_FILE)) {
      try {
        const locationColors = JSON.parse(fs.readFileSync(LOCATION_COLORS_FILE, 'utf8'));
        const insertColor = db.prepare('INSERT OR REPLACE INTO location_colors (location, color) VALUES (?, ?)');
        
        Object.entries(locationColors).forEach(([location, color]) => {
          insertColor.run(location, color);
        });
        
        insertColor.finalize();
        console.log('Imported existing location colors from JSON');
      } catch (error) {
        console.error('Error importing location colors:', error.message);
      }
    } else {
      // Insert default location colors
      const defaultColors = {
        'IT OFFICE': '#3498db',
        'MARKETING': '#9b59b6',
        'IT SERVER ROOM': '#f39c12',
        'default': '#cccccc'
      };

      const insertColor = db.prepare('INSERT OR REPLACE INTO location_colors (location, color) VALUES (?, ?)');
      Object.entries(defaultColors).forEach(([location, color]) => {
        insertColor.run(location, color);
      });
      insertColor.finalize();
      console.log('Created default location colors');
    }

    // Add missing columns as schema migration
    setTimeout(() => {
      // Check if updated_at column exists in users table
      db.all("PRAGMA table_info(users)", [], (err, rows) => {
        if (err) {
          console.error('Error checking table schema:', err.message);
          return;
        }
        
        // Add updated_at column if it doesn't exist
        const hasUpdatedAt = rows.some(row => row.name === 'updated_at');
        if (!hasUpdatedAt) {
          console.log('Adding updated_at column to users table...');
          db.run('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP', (err) => {
            if (err) {
              console.error('Error adding updated_at column:', err.message);
            } else {
              console.log('Successfully added updated_at column to users table');
            }
          });
        }
      });
    }, 1000); // Delay to ensure other operations complete first
  });
}

// User management functions
const users = {
  // Get user by credentials (username or email) without checking password or active status
  async getUserByCredentials(usernameOrEmail) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT u.*, GROUP_CONCAT(r.name) as roles 
         FROM users u 
         LEFT JOIN user_roles ur ON u.id = ur.user_id 
         LEFT JOIN roles r ON ur.role_id = r.id 
         WHERE u.username = ? OR u.email = ? 
         GROUP BY u.id`,
        [usernameOrEmail, usernameOrEmail],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else {
            // Format roles as array
            const user = {
              ...row,
              roles: row.roles ? row.roles.split(',') : []
            };
            resolve(user);
          }
        }
      );
    });
  },

  // Get user by ID with roles
  async getById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT u.*, GROUP_CONCAT(r.name) as roles 
         FROM users u 
         LEFT JOIN user_roles ur ON u.id = ur.user_id 
         LEFT JOIN roles r ON ur.role_id = r.id 
         WHERE u.id = ? 
         GROUP BY u.id`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else if (!row) resolve(null);
          else {
            // Format roles as array
            const user = {
              ...row,
              roles: row.roles ? row.roles.split(',') : []
            };
            resolve(user);
          }
        }
      );
    });
  },

  // Get user by username with roles
  async getByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT u.*, GROUP_CONCAT(r.name) as roles 
         FROM users u 
         LEFT JOIN user_roles ur ON u.id = ur.user_id 
         LEFT JOIN roles r ON ur.role_id = r.id 
         WHERE u.username = ? 
         GROUP BY u.id`,
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  },

  // Get user by email
  async getByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT u.*, GROUP_CONCAT(r.name) as roles 
         FROM users u 
         LEFT JOIN user_roles ur ON u.id = ur.user_id 
         LEFT JOIN roles r ON ur.role_id = r.id 
         WHERE u.email = ? 
         GROUP BY u.id`,
        [email],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  },

  // Authenticate user with either username or email
  async authenticate(usernameOrEmail, password) {
    try {
      // Try to find user by username or email
      let user = await this.getByUsername(usernameOrEmail);
      
      if (!user) {
        // If not found by username, try email
        user = await this.getByEmail(usernameOrEmail);
      }
      
      if (!user) return null;
      if (!user.active) return null;

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return null;

      // Update last login time
      db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles ? user.roles.split(',') : []
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  },

  // Create a new user
  async create(userData) {
    const { username, password, email, roles = ['user'] } = userData;

    return new Promise(async (resolve, reject) => {
      try {
        const passwordHash = await bcrypt.hash(password, 10);

        db.run(
          'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
          [username, passwordHash, email],
          function(err) {
            if (err) {
              reject(err);
              return;
            }

            const userId = this.lastID;
            
            // Add user roles
            const assignRolePromises = roles.map(role => {
              return new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = ?',
                  [userId, role],
                  (err) => {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });
            });

            Promise.all(assignRolePromises)
              .then(() => resolve({ id: userId, username, email, roles }))
              .catch(reject);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  },

  // Verify a user's password
  async verify(id, password) {
    return new Promise((resolve, reject) => {
      db.get('SELECT password FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(false);
        else {
          bcrypt.compare(password, row.password, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        }
      });
    });
  },

  // Update a user's details
  async update(id, userData) {
    return new Promise(async (resolve, reject) => {
      try {
        // Start a transaction
        await new Promise((res, rej) => {
          db.run('BEGIN TRANSACTION', err => err ? rej(err) : res());
        });

        // Update basic user info
        const fieldsToUpdate = [];
        const values = [];

        // Only include fields that were provided
        if (userData.username !== undefined) {
          fieldsToUpdate.push('username = ?');
          values.push(userData.username);
        }
        
        if (userData.email !== undefined) {
          fieldsToUpdate.push('email = ?');
          values.push(userData.email || null); // Allow null for email
        }
        
        if (userData.active !== undefined) {
          fieldsToUpdate.push('active = ?');
          values.push(userData.active ? 1 : 0);
        }
        
        // Only update if there are fields to update
        if (fieldsToUpdate.length > 0) {
          // Check if updated_at column exists before using it
          const columnsCheck = await new Promise((res, rej) => {
            db.all("PRAGMA table_info(users)", [], (err, rows) => {
              if (err) return rej(err);
              res(rows.map(row => row.name));
            });
          });
          
          // Add updated_at column only if it exists
          if (columnsCheck.includes('updated_at')) {
            fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
          }
          
          // Add user ID to values array
          values.push(id);
          
          // Execute the update
          await new Promise((res, rej) => {
            db.run(
              `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`,
              values,
              function(err) {
                if (err) return rej(err);
                if (this.changes === 0) return rej(new Error('User not found'));
                res();
              }
            );
          });
        }

        // Update roles if provided
        if (userData.roles && Array.isArray(userData.roles)) {
          // First, delete all existing roles
          await new Promise((res, rej) => {
            db.run('DELETE FROM user_roles WHERE user_id = ?', [id], err => err ? rej(err) : res());
          });
          
          // Then, add new roles
          for (const roleName of userData.roles) {
            // Get role ID
            const role = await new Promise((res, rej) => {
              db.get('SELECT id FROM roles WHERE name = ?', [roleName], (err, row) => {
                if (err) rej(err);
                else res(row);
              });
            });

            if (role) {
              await new Promise((res, rej) => {
                db.run(
                  'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
                  [id, role.id],
                  err => err ? rej(err) : res()
                );
              });
            }
          }
        }

        // Commit the transaction
        await new Promise((res, rej) => {
          db.run('COMMIT', err => err ? rej(err) : res());
        });

        // Get the updated user with roles
        const user = await this.getById(id);
        if (!user) {
          throw new Error('User not found after update');
        }
        resolve(user);
      } catch (error) {
        // Rollback on error
        try {
          await new Promise((res) => {
            db.run('ROLLBACK', err => {
              if (err) console.error('Error rolling back transaction:', err);
              res();
            });
          });
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);
        }
        
        reject(error);
      }
    });
  },

  // Delete a user
  async delete(id) {
    return new Promise(async (resolve, reject) => {
      try {
        // Start a transaction
        await new Promise((res, rej) => {
          db.run('BEGIN TRANSACTION', err => err ? rej(err) : res());
        });

        // First, delete related records from other tables
        
        // Delete user's roles
        await new Promise((res, rej) => {
          db.run('DELETE FROM user_roles WHERE user_id = ?', [id], err => err ? rej(err) : res());
        });
        
        // Delete user's settings
        await new Promise((res, rej) => {
          db.run('DELETE FROM user_settings WHERE user_id = ?', [id], err => err ? rej(err) : res());
        });
        
        // Finally, delete the user
        const result = await new Promise((res, rej) => {
          db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
            if (err) rej(err);
            else res({ changes: this.changes });
          });
        });

        // Commit the transaction
        await new Promise((res, rej) => {
          db.run('COMMIT', err => err ? rej(err) : res());
        });

        resolve({
          success: true,
          deleted: result.changes > 0,
          message: result.changes > 0 
            ? `User with ID ${id} deleted successfully` 
            : `No user found with ID ${id}`
        });
      } catch (error) {
        // Rollback on error
        try {
          await new Promise((res) => {
            db.run('ROLLBACK', err => {
              if (err) console.error('Error rolling back transaction:', err);
              res();
            });
          });
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);
        }
        
        reject(error);
      }
    });
  },

  // List all users
  async list() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT u.id, u.username, u.email, u.created_at, u.last_login, u.active, 
         GROUP_CONCAT(r.name) as roles
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         GROUP BY u.id`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else {
            // Format roles as arrays
            const users = rows.map(user => ({
              ...user,
              roles: user.roles ? user.roles.split(',') : []
            }));
            resolve(users);
          }
        }
      );
    });
  }
};

// Location colors functions
const locationColors = {
  // Get all location colors
  async getAll() {
    return new Promise((resolve, reject) => {
      db.all('SELECT location, color FROM location_colors', [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Convert to object format
          const colors = rows.reduce((obj, row) => {
            obj[row.location] = row.color;
            return obj;
          }, {});
          resolve(colors);
        }
      });
    });
  },

  // Update location colors
  async update(colorsObject) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const stmt = db.prepare('INSERT OR REPLACE INTO location_colors (location, color, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        let hasError = false;

        Object.entries(colorsObject).forEach(([location, color]) => {
          stmt.run(location, color, (err) => {
            if (err && !hasError) {
              hasError = true;
              stmt.finalize();
              db.run('ROLLBACK');
              reject(err);
            }
          });
        });

        if (!hasError) {
          stmt.finalize();
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve({ success: true, message: 'Location colors updated successfully' });
          });
        }
      });
    });
  }
};

// User settings management functions
const userSettings = {
  // Get a specific setting for a user
  async get(userId, key) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT setting_value FROM user_settings WHERE user_id = ? AND setting_key = ?',
        [userId, key],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            // Return the parsed value if found, or null if not
            try {
              resolve(row ? JSON.parse(row.setting_value) : null);
            } catch (parseError) {
              console.error(`Error parsing setting ${key} for user ${userId}:`, parseError);
              resolve(row ? row.setting_value : null);
            }
          }
        }
      );
    });
  },

  // Get all settings for a user
  async getAll(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT setting_key, setting_value FROM user_settings WHERE user_id = ?',
        [userId],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Convert to object format with parsed values
            const settings = rows.reduce((obj, row) => {
              try {
                obj[row.setting_key] = JSON.parse(row.setting_value);
              } catch (parseError) {
                console.error(`Error parsing setting ${row.setting_key}:`, parseError);
                obj[row.setting_key] = row.setting_value;
              }
              return obj;
            }, {});
            resolve(settings);
          }
        }
      );
    });
  },

  // Save a setting for a user
  async set(userId, key, value) {
    return new Promise((resolve, reject) => {
      // Convert value to JSON string if it's not already a string
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      db.run(
        'INSERT OR REPLACE INTO user_settings (user_id, setting_key, setting_value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [userId, key, stringValue],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ success: true, message: `Setting "${key}" updated successfully` });
          }
        }
      );
    });
  },

  // Delete a setting for a user
  async delete(userId, key) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM user_settings WHERE user_id = ? AND setting_key = ?',
        [userId, key],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ 
              success: true, 
              message: `Setting "${key}" deleted successfully`,
              removed: this.changes > 0
            });
          }
        }
      );
    });
  },

  // Delete all settings for a user
  async deleteAll(userId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM user_settings WHERE user_id = ?',
        [userId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ 
              success: true, 
              message: `All settings deleted for user ID ${userId}`,
              count: this.changes
            });
          }
        }
      );
    });
  }
};

// Export a close method for graceful shutdown
const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
          reject(err);
        } else {
          console.log('Database connection closed successfully');
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
};

/**
 * Get all users
 * @returns {Array} List of all users
 */
const getAllUsers = () => {
  try {
    return db.prepare(`
      SELECT users.id, users.username, users.email, users.created_at, users.last_login,
      json_group_array(roles.name) as roles
      FROM users
      LEFT JOIN user_roles ON users.id = user_roles.user_id
      LEFT JOIN roles ON user_roles.role_id = roles.id
      GROUP BY users.id
    `).all().map(user => {
      user.roles = JSON.parse(user.roles).filter(r => r !== null);
      return user;
    });
  } catch (err) {
    console.error('Error getting all users:', err);
    throw new Error('Failed to get users');
  }
};

/**
 * Reset a user's password
 * @param {number} userId - The ID of the user to reset password for
 * @param {string} newPassword - The new password
 * @returns {Object} Result of the operation
 */
const resetUserPassword = (userId, newPassword) => {
  return new Promise((resolve, reject) => {
    console.log(`Attempting to reset password for user ID: ${userId}`);
    
    // First, check if the user exists using direct db.get
    db.get('SELECT id, username FROM users WHERE id = ?', [userId], (err, user) => {
      if (err) {
        console.error('Error checking user existence:', err);
        return reject(new Error('Database error while verifying user'));
      }
      
      if (!user) {
        console.error(`User with ID ${userId} not found`);
        return reject(new Error('User not found'));
      }
      
      console.log(`Found user: ${user.username} (ID: ${user.id})`);
      
      // Hash the new password
      bcrypt.hash(newPassword, 10, (hashErr, hashedPassword) => {
        if (hashErr) {
          console.error('Error hashing password:', hashErr);
          return reject(new Error('Failed to hash password'));
        }
        
        console.log('Password hashed successfully');
        
        // Update the user's password using direct db.run
        db.run(
          'UPDATE users SET password_hash = ? WHERE id = ?',
          [hashedPassword, userId],
          function(updateErr) {
            if (updateErr) {
              console.error('SQL Error during password update:', updateErr);
              return reject(new Error('Database error during password update'));
            }
            
            console.log(`Update result: changes=${this.changes}`);
            
            if (!this.changes) {
              console.error('Update failed, no rows affected');
              return reject(new Error('Failed to update password'));
            }
            
            console.log(`Password successfully reset for user ID: ${userId}`);
            resolve({ success: true, message: 'Password reset successfully' });
          }
        );
      });
    });
  });
};

module.exports = {
  db,
  users,
  locationColors,
  userSettings,
  closeDatabase,
  getAllUsers,
  resetUserPassword
}; 