# Dashboard Backend API

This is the backend API server for the Dashboard application. It provides an API interface between the frontend and InfluxDB.

## Features

- Secure API endpoints for accessing InfluxDB data
- Authentication and session management
- CORS protection for security
- Rate limiting to prevent abuse
- Input validation and sanitization

## Configuration

Configuration is done through environment variables, which are typically set in the `.env` file in the root of the project. The backend will also read from `.env.production` for production environments.

### Key Environment Variables

```
# InfluxDB Configuration
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your_token
ORG=your_org
BUCKET=sensor_data

# Authentication 
ADMIN_PASSWORD_HASH=bcrypt_hash_of_password
SESSION_SECRET=secure_random_string

# Server Configuration
PORT=5000
```

## API Endpoints

### Authentication

- `POST /api/login` - Log in with password
- `POST /api/logout` - Log out
- `GET /api/session` - Get current session info

### Sensors

- `GET /api/sensors` - Get list of all sensors
- `GET /api/sensors/status` - Get status of all sensors
- `GET /api/sensors/:name/history` - Get historical data for a specific sensor
- `POST /api/sensors/:name/visibility` - Update visibility settings for a sensor

### Data Management

- `POST /api/add-location` - Add a new sensor location
- `POST /api/delete-location` - Delete a sensor location
- `POST /api/import-lp` - Import data in Line Protocol format
- `GET /api/export` - Export data in various formats

## Running the Backend Independently

To run the backend server independently:

```bash
cd dashboard_refaktor
node backend/server.js
```

Or using the provided script:

```bash
./start-split.sh backend
```

## Production Deployment

For production environments, it's recommended to:

1. Use a process manager like PM2:
   ```
   pm2 start backend/server.js --name dashboard-backend
   ```

2. Set up a reverse proxy with Nginx:
   ```nginx
   location /api/ {
     proxy_pass http://localhost:5000/api/;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection 'upgrade';
     proxy_set_header Host $host;
     proxy_cache_bypass $http_upgrade;
   }
   ```

3. Ensure HTTPS is enabled for secure communication

4. Set appropriate CORS headers for your production domain

## Security Considerations

- Always change the default admin password
- Use strong, randomly generated session secrets
- In production, enable HTTPS
- Regularly update dependencies to patch security vulnerabilities 