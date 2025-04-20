# Role-Based Access Control in IoT Sensor Dashboard

This document explains the role-based access control (RBAC) system implemented in the IoT Sensor Dashboard project. The system provides different levels of access to users based on their assigned roles.

## Available Roles

The system implements three distinct user roles with different permission levels:

| Role    | Description                       | Permission Level |
|---------|-----------------------------------|-----------------|
| `admin` | Administrator with full access    | Highest         |
| `user`  | Regular user with limited access  | Medium          |
| `viewer`| Read-only access                  | Lowest          |

## Role Definitions and Permissions

### Admin Role

Administrators have full access to all features and functionalities of the dashboard:

- **User Management**: Can create, edit, and delete users
- **System Configuration**: Can modify system-wide settings
- **Dashboard Management**: Can create, edit, and delete dashboards
- **Data Management**: Can access and modify all data
- **User Settings**: Can view and modify all user settings
- **API Access**: Has access to all API endpoints

Admins can perform all operations that users and viewers can perform, plus administrative functions.

### User Role

Regular users have standard access to most features but with limited administrative capabilities:

- **Dashboard Access**: Can view all dashboards
- **Data Visualization**: Can create and customize charts and visualizations
- **Data Export**: Can export data in various formats (Excel, CSV, etc.)
- **Personal Settings**: Can modify their own settings and preferences
- **Data Filtering**: Can filter data by location, time range, etc.

Users cannot manage other users or modify system-wide configurations.

### Viewer Role

Viewers have read-only access to dashboards and data:

- **Dashboard Viewing**: Can view pre-configured dashboards
- **Data Viewing**: Can view data and visualizations
- **Basic Filtering**: Can apply basic filters to view different data subsets
- **No Data Export**: Cannot export data from the system
- **No Configuration**: Cannot modify any settings or configurations

Viewers cannot create new dashboards, modify existing ones, or change system settings.

## Technical Implementation

### Database Structure

Roles are stored in the database with a many-to-many relationship to users:

```sql
-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

-- User roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL,
  role_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
```

The system initializes with three default roles:

```javascript
const roles = [
  { name: 'admin', description: 'Administrator with full access' },
  { name: 'user', description: 'Regular user with limited access' },
  { name: 'viewer', description: 'View-only access' }
];
```

### Authentication Flow

1. **Login**: User authenticates with username/email and password
2. **Session Creation**: Upon successful authentication, a session is created containing user info including roles
3. **Permission Checking**: Throughout the application, user roles are checked before performing operations

### Backend Access Control

The backend implements middleware functions to check role permissions:

```javascript
// Admin role middleware
function isAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
```

API endpoints use these middleware functions to restrict access:

```javascript
// List all users (admin only)
app.get('/api/users', async (req, res) => {
  if (!req.session.user || !req.session.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const userList = await users.list();
    res.json(userList);
  } catch (err) {
    console.error("Error listing users:", err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});
```

### Frontend Access Control

The frontend uses the authenticated user's roles to conditionally render UI elements and restrict access to certain features:

```javascript
// Example of conditional rendering based on user role
{user.roles.includes('admin') && (
  <Link to="/admin/users" className="admin-link">
    User Management
  </Link>
)}
```

The `useAuth` hook provides access to the authenticated user and their roles throughout the application:

```javascript
const { loggedIn, user } = useAuth();

// Check if user has admin role
const isAdmin = user?.roles.includes('admin');
```

## User Management

### Creating Users

Only administrators can create new users. When creating a user, the admin must assign at least one role.

By default, new users are created with the `user` role:

```javascript
const [newUser, setNewUser] = useState({
  username: '',
  password: '',
  email: '',
  roles: ['user']
});
```

### Editing Roles

Administrators can edit user roles through the user management interface. A user can have multiple roles assigned simultaneously (e.g., both `admin` and `user` roles).

### User Deletion

Administrators can delete users, but with a safety mechanism: users with the `admin` role cannot be deleted through the interface to prevent accidental removal of administrative accounts.

## Security Considerations

1. **Role Verification**: All role-based permissions are verified on both the frontend and backend
2. **Session Protection**: User roles are stored in server-side sessions, not client-side cookies
3. **Least Privilege**: Users are given only the permissions they need for their tasks
4. **Multiple Roles**: Users can have multiple roles to allow for flexible permission configurations

## Best Practices

1. **Admin Accounts**: Limit the number of admin accounts to minimize security risks
2. **Role Assignment**: Assign the least privileged role necessary for a user's tasks
3. **Regular Audits**: Periodically review user roles and permissions
4. **Default Role**: Use `viewer` as the default role for new users when maximum security is required

---

By implementing this role-based access control system, the IoT Sensor Dashboard ensures that users have appropriate access to features and data based on their responsibilities, enhancing both security and usability. 