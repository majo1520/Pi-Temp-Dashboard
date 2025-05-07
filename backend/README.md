# Dashboard Backend with Load Balancing and Message Queue

This is the enhanced backend for the BME280 IoT Dashboard application, now with load balancing and message queue capabilities for handling high volume sensor data.

## Features

- **Load Balancing**: Utilizes Node.js cluster module to distribute load across all available CPU cores
- **Message Queue**: Implements Bull queue system for reliable processing of high-volume sensor data
- **MQTT Support**: Handles sensor data via MQTT protocol
- **GraphQL API**: Optional GraphQL API alongside REST
- **Queue Management**: API endpoints for monitoring and managing queues
- **Graceful Fallbacks**: System works even when Redis or optional dependencies are unavailable

## Requirements

- Node.js 14+
- Redis (optional, but recommended for message queue and caching)
- MQTT Broker (optional, for MQTT support)

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables by creating a `.env` file (see `env.example`):
   ```
   PORT=5000
   INFLUX_URL=http://localhost:8086
   INFLUX_TOKEN=your_influx_token
   ORG=your_org
   BUCKET=your_bucket
   SESSION_SECRET=your_session_secret
   CACHE_ENABLED=true
   REDIS_URL=redis://localhost:6379
   MQTT_ENABLED=true
   MQTT_BROKER=mqtt://localhost:1883
   CLUSTER_MODE=false
   ```

3. Start the server:
   ```
   npm start
   ```

## Running in Cluster Mode

To utilize all available CPU cores for better performance:

```
npm run cluster
```

For production:

```
npm run production:cluster
```

## Message Queue System

The message queue system provides:

1. **Reliable Processing**: Ensures sensor data is processed reliably, even during high load
2. **Automatic Retries**: Failed jobs are automatically retried
3. **Monitoring**: Queue statistics and management via API

### Redis Requirements

The message queue system uses Redis as its backend. You have three options:

1. **Install Redis** (recommended for production):
   ```
   # Ubuntu/Debian
   sudo apt-get install redis-server
   sudo systemctl start redis
   
   # Check if it's running
   redis-cli ping
   ```

2. **Use in-memory fallback**: If Redis is unavailable, the system will log errors but continue 
   operating with reduced functionality. This is suitable for development but not recommended
   for production due to data loss risk on server restart.

3. **Disable queue features**: Set `CACHE_ENABLED=false` in your .env file to completely 
   disable the queue system and prevent connection errors.

### Queue Management API

- `GET /api/queues/stats` - Get statistics for all queues
- `POST /api/queues/clear/:queueName` - Clear a specific queue
- `POST /api/queues/pause/:queueName` - Pause a specific queue
- `POST /api/queues/resume/:queueName` - Resume a specific queue

### Queue UI Dashboard

To monitor queues visually:

```
npm run queue-ui
```

This starts a Bull Board UI on http://localhost:3000 (default).

## API Documentation

API documentation is available at `/api/docs` when the server is running.

## GraphQL API

If enabled, the GraphQL API is available at `/graphql`.

## MQTT Integration

To integrate with MQTT for sensor data:

1. Make sure MQTT_ENABLED=true in your .env file
2. Set MQTT_BROKER to your MQTT broker address
3. Sensor data should be published to the `sensors/#` topic

## Troubleshooting

### Redis Connection Errors

If you see errors like:
```
Error in sensor-data queue: Error: connect ECONNREFUSED 127.0.0.1:6379
```

This means Redis is not running. You can:

1. Install and start Redis (see "Redis Requirements" above)
2. Set `CACHE_ENABLED=false` in your .env file to disable Redis features
3. Change `REDIS_URL` in your .env file if Redis is running on a different host/port

### MQTT Connection Issues

If MQTT integration isn't working:

1. Ensure your MQTT broker is running
2. Check the `MQTT_BROKER` variable in your .env file
3. Set `MQTT_ENABLED=false` to disable MQTT features if not needed

## Architecture

```
┌────────────────┐     ┌─────────────┐     ┌─────────────┐
│                │     │             │     │             │
│  MQTT Broker   ├────►│  Message    │     │             │
│                │     │  Queue      ├────►│  InfluxDB   │
└────────────────┘     │             │     │             │
                       └──────┬──────┘     │             │
┌────────────────┐            │            │             │
│                │            │            │             │
│  HTTP API      ├────────────┘            │             │
│                │                         │             │
└────────────────┘                         └─────────────┘
```

## Performance Considerations

- **Redis**: Ensure Redis has enough memory allocated (at least 512MB recommended)
- **Load Balancing**: Cluster mode will spawn processes equal to CPU count, ensure server has enough RAM
- **Queue Workers**: Each worker process handles the queue independently

## Debugging

To enable detailed logging:

```
DEBUG=bull:* npm start
```

For cluster debugging:

```
DEBUG=bull:*,cluster:* npm run cluster
``` 