# YouTube Video Processor - Deployment Guide

## Prerequisites

### System Requirements
- Node.js 18+ or Docker
- Redis 6+
- FFmpeg
- Whisper.cpp (local installation)
- OpenAI API key

### Hardware Recommendations
- **CPU**: 4+ cores (8+ recommended for concurrent processing)
- **Memory**: 8GB+ RAM (16GB+ recommended)
- **Storage**: 50GB+ available space
- **Network**: Stable internet connection for video downloads

## Quick Start with Docker

### 1. Clone and Setup
```bash
git clone <repository-url>
cd yt-video-reader
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.production .env

# Edit configuration
nano .env
```

Required environment variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `REDIS_URL`: Redis connection string
- `WHISPER_MODEL_PATH`: Path to whisper.cpp models

### 3. Start Services
```bash
# Start with Docker Compose
docker-compose up -d

# Check status
docker-compose ps
```

### 4. Verify Installation
```bash
# Health check
curl http://localhost:3000/health

# API documentation
curl http://localhost:3000/api/docs
```

## Manual Installation

### 1. Install Dependencies
```bash
# Install Node.js dependencies
npm ci --only=production

# Install system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install -y ffmpeg redis-server

# Install whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make
./download-ggml-model.sh large-v3
```

### 2. Configuration
```bash
# Copy environment file
cp .env.production .env

# Edit configuration
nano .env
```

### 3. Build and Start
```bash
# Build application
npm run build

# Start Redis
sudo systemctl start redis-server

# Start application
npm start
```

## Production Deployment

### Docker Deployment
```bash
# Build production image
docker build -t yt-video-processor .

# Run container
docker run -d \
  --name yt-video-processor \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/models:/app/models \
  --env-file .env \
  yt-video-processor
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: yt-video-processor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: yt-video-processor
  template:
    metadata:
      labels:
        app: yt-video-processor
    spec:
      containers:
      - name: app
        image: yt-video-processor:latest
        ports:
        - containerPort: 3000
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: openai-api-key
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        volumeMounts:
        - name: data-volume
          mountPath: /app/data
        - name: models-volume
          mountPath: /app/models
      volumes:
      - name: data-volume
        persistentVolumeClaim:
          claimName: data-pvc
      - name: models-volume
        persistentVolumeClaim:
          claimName: models-pvc
```

### Cloud Deployment Options

#### AWS ECS
```bash
# Create task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# Create service
aws ecs create-service --cluster my-cluster --service-name yt-video-processor --task-definition yt-video-processor:1 --desired-count 2
```

#### Google Cloud Run
```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/[PROJECT-ID]/yt-video-processor

# Deploy to Cloud Run
gcloud run deploy yt-video-processor \
  --image gcr.io/[PROJECT-ID]/yt-video-processor \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

#### Azure Container Instances
```bash
# Create container group
az container create \
  --resource-group myResourceGroup \
  --name yt-video-processor \
  --image yt-video-processor:latest \
  --cpu 2 \
  --memory 4 \
  --ports 3000 \
  --environment-variables OPENAI_API_KEY=your-key
```

## Monitoring and Logging

### Health Checks
- **Health endpoint**: `GET /health`
- **API docs**: `GET /api/docs`
- **System stats**: `GET /trpc/system.stats`

### Logging
```bash
# View logs (Docker)
docker logs -f yt-video-processor

# View logs (systemd)
journalctl -u yt-video-processor -f
```

### Monitoring Setup
```bash
# Install monitoring tools
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name yt-video-processor
pm2 startup
pm2 save
```

## Security Considerations

### Network Security
- Use HTTPS in production
- Configure firewall rules
- Limit Redis access to application only

### Environment Security
- Store secrets in secure vaults
- Use environment-specific configurations
- Enable audit logging

### API Security
- Implement rate limiting
- Add authentication if needed
- Validate all inputs

## Scaling

### Horizontal Scaling
```bash
# Scale with Docker Compose
docker-compose up -d --scale app=3

# Scale with Kubernetes
kubectl scale deployment yt-video-processor --replicas=5
```

### Load Balancing
```nginx
upstream yt_video_processor {
    server app1:3000;
    server app2:3000;
    server app3:3000;
}

server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://yt_video_processor;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   ```bash
   # Check Redis status
   redis-cli ping
   
   # Check Redis logs
   tail -f /var/log/redis/redis-server.log
   ```

2. **FFmpeg Not Found**
   ```bash
   # Install FFmpeg
   sudo apt install ffmpeg
   
   # Verify installation
   ffmpeg -version
   ```

3. **Whisper Model Missing**
   ```bash
   # Download model
   cd whisper.cpp
   ./download-ggml-model.sh large-v3
   
   # Verify model path
   ls -la models/
   ```

4. **Out of Memory**
   ```bash
   # Increase memory limits
   export NODE_OPTIONS="--max-old-space-size=8192"
   
   # Adjust Docker memory
   docker run --memory=4g yt-video-processor
   ```

### Performance Tuning

1. **Concurrency Settings**
   - Adjust `DOWNLOAD_CONCURRENCY` based on network
   - Adjust `TRANSCRIPTION_CONCURRENCY` based on CPU cores

2. **Memory Optimization**
   - Use smaller whisper models for faster processing
   - Implement file cleanup strategies
   - Monitor memory usage

3. **Storage Optimization**
   - Use SSD storage for better I/O performance
   - Implement automatic cleanup
   - Consider cloud storage for large files

## Backup and Recovery

### Data Backup
```bash
# Backup data directory
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# Backup Redis
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb backup/
```

### Recovery
```bash
# Restore data
tar -xzf backup-20231201.tar.gz

# Restore Redis
cp backup/dump.rdb /var/lib/redis/
sudo systemctl restart redis-server
```

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review application logs
3. Check system resource usage
4. Verify configuration settings