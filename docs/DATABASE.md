# Database Documentation

This document provides detailed information about the database implementation in the IoT Sensor Dashboard project.

## Overview

The IoT Sensor Dashboard uses two database systems:

1. **InfluxDB**: Time-series database for storing sensor measurements (temperature, humidity, pressure)
2. **SQLite**: Relational database for user management, application settings, and UI preferences

This document focuses on the SQLite implementation and usage.

## SQLite Implementation

### Purpose and Role

SQLite serves as the persistent storage solution for:

- User accounts and authentication
- Role-based access control
- User-specific settings and preferences
- Location color customizations
- Dashboard UI state persistence

### Database Location

The SQLite database is stored at:

```
backend/dashboard.db
```

### Connection Management

The application implements a connection pooling mechanism to improve performance:

- Uses `better-sqlite3` for the main connection pool (faster performance)
- Maintains compatibility with `sqlite3` for legacy code
- Default pool size: 5 connections (configurable)
- Implements round-robin distribution for load balancing

## Schema Design

### Tables Overview

| Table Name | Purpose | Key Fields |
|------------|---------|------------|
| `users` | Store user accounts | id, username, password_hash, email, active |
| `roles` | Define available roles | id, name, description |
| `user_roles` | Map users to roles | user_id, role_id |
| `location_colors` | Store color preferences | location, color |
| `user_settings` | Store user settings | id, user_id, setting_key, setting_value |

### Detailed Schema

#### Users Table

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL CHECK(length(username) >= 3),
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  last_login TIMESTAMP,
  active BOOLEAN DEFAULT 1 CHECK(active IN (0, 1))
)
```

#### Roles Table

```sql
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT
)
```

Default roles:
- `admin`: Administrator with full access
- `user`: Regular user with limited access
- `viewer`: View-only access

#### User Roles Mapping Table

```sql
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER,
  role_id INTEGER,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
)
```

#### Location Colors Table

```sql
CREATE TABLE IF NOT EXISTS location_colors (
  location TEXT PRIMARY KEY,
  color TEXT NOT NULL CHECK(color LIKE '#%'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Default colors:
- `IT OFFICE`: #3498db
- `MARKETING`: #9b59b6
- `IT SERVER ROOM`: #f39c12
- `default`: #cccccc

#### User Settings Table

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, setting_key)
)
```

## Security Considerations

### Password Storage

- Passwords are never stored in plaintext
- Passwords are hashed using bcrypt with a cost factor of 10
- Password reset functionality is available for administrators

### Data Access Patterns

- All user data queries use parameterized statements to prevent SQL injection
- User settings are accessed only by authenticated users
- Input validation is applied to all database operations
- Transaction support for multi-step operations

## API Modules

The SQLite functionality is organized into specialized modules:

### Users Module

```javascript
const users = {
  // User management functions
  async getUserByCredentials(usernameOrEmail) {...},
  async getById(id) {...},
  async getByUsername(username) {...},
  async getByEmail(email) {...},
  async authenticate(usernameOrEmail, password) {...},
  async create(userData) {...},
  async verify(id, password) {...},
  async update(id, userData) {...},
  async delete(id) {...},
  async list() {...}
};
```

### Location Colors Module

```javascript
const locationColors = {
  // Location color management
  async getAll() {...},
  async update(colorsObject) {...}
};
```

### User Settings Module

```javascript
const userSettings = {
  // User settings management
  async get(userId, key) {...},
  async getAll(userId) {...},
  async set(userId, key, value) {...},
  async delete(userId, key) {...},
  async deleteAll(userId) {...}
};
```

## Default Data

On first initialization, the database is populated with:

1. Default roles (admin, user, viewer)
2. Default admin user:
   - Username: admin
   - Password: admin (should be changed immediately)
   - Email: admin@example.com
3. Custom admin account (if configured):
   - Username: admin
   - Email: m.barat@europlac.com

## Performance Optimization

Several performance optimizations are implemented:

1. **Connection Pooling**: Maintain a pool of open connections to reduce connection overhead
2. **Better-SQLite3**: Uses a faster SQLite implementation for improved performance
3. **Prepared Statements**: Reuse prepared statements for common queries
4. **Optimized Indices**: Tables are indexed on frequently queried fields
5. **Transactional Operations**: Multi-step operations use transactions for consistency and performance

## Backup and Maintenance

### Regular Backups

It's recommended to schedule regular backups of the SQLite database:

```bash
# Back up SQLite database
cp ~/iot-sensor-dashboard/backend/dashboard.db $BACKUP_DIR/dashboard-$DATE.db
```

### Database Maintenance

Occasional database maintenance tasks:

```bash
# Compact the database (remove unused space)
sqlite3 dashboard.db 'VACUUM;'

# Check database integrity
sqlite3 dashboard.db 'PRAGMA integrity_check;'
```

## Troubleshooting

### Common Issues

1. **Database Locked Error**:
   - Cause: Multiple processes trying to write to the database simultaneously
   - Solution: Ensure all operations properly release connections, increase timeout

2. **Database Corruption**:
   - Cause: Improper shutdown, disk errors
   - Solution: Restore from backup, run integrity check

3. **Performance Degradation**:
   - Cause: Large tables, fragmentation
   - Solution: Run VACUUM, optimize queries, check indices

### Database Administration

To interact with the database directly:

```bash
# Access the SQLite database
cd ~/iot-sensor-dashboard/backend
sqlite3 dashboard.db

# Inside SQLite shell
sqlite> .tables               # List all tables
sqlite> .schema users         # Show users table schema
sqlite> SELECT * FROM users;  # List all users
sqlite> .exit                 # Exit SQLite shell
```

## Integration with Application

### Backend Integration

The database module (`db.cjs`) exports:
- Users management functions
- Location colors functions
- User settings functions
- Database closing function

```javascript
module.exports = {
  db,
  users,
  locationColors,
  userSettings,
  closeDatabase,
  getAllUsers,
  resetUserPassword
};
```

### Frontend Integration

The frontend interacts with the SQLite database indirectly through API endpoints:
- `/api/users` - User management
- `/api/user-settings` - User settings
- `/api/login` - Authentication
- `/api/session` - Session management 