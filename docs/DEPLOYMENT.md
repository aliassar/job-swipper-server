# Production Deployment Guide

This guide covers deploying the Job Swiper backend server to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [CORS Configuration](#cors-configuration)
- [Deployment Platforms](#deployment-platforms)
- [Post-Deployment](#post-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying to production, ensure you have:

- ✅ A PostgreSQL database (Neon, AWS RDS, or any PostgreSQL provider)
- ✅ An S3-compatible storage service (Cloudflare R2, AWS S3)
- ✅ Your frontend application URL
- ✅ OAuth credentials (if using Google/GitHub login)
- ✅ SMTP credentials (if using email/password registration)

## Environment Setup

### Required Environment Variables

These variables **MUST** be set for the server to start:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# JWT Authentication
JWT_SECRET=<generate-with-openssl-rand-base64-32>

# S3 Storage
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1  # or 'auto' for Cloudflare R2
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_ENDPOINT=https://your-endpoint.com

# CORS
ALLOWED_ORIGINS=https://app.yourdomain.com
```

### OAuth Configuration (Optional)

If you want to enable OAuth login, configure these variables:

```bash
# Server OAuth (Google/GitHub login)
NEXTAUTH_URL=https://api.yourdomain.com
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Frontend URL for OAuth redirects
FRONTEND_URL=https://app.yourdomain.com
```

**Important OAuth Setup Notes:**

1. The **server** handles OAuth authentication, not the frontend
2. OAuth callback URLs should point to your **API server**:
   - Google: `https://api.yourdomain.com/api/auth/google/callback`
   - GitHub: `https://api.yourdomain.com/api/auth/github/callback`
3. Frontend should redirect users to:
   - `GET /api/auth/google` for Google login
   - `GET /api/auth/github` for GitHub login
4. Server returns JWT token to frontend via callback
5. Frontend stores JWT and uses it for subsequent API requests

### Email Features (Optional)

For email/password registration and password reset:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@yourdomain.com
```

### Email Connections (Optional)

For users to connect their email accounts:

```bash
# Encryption for IMAP passwords
ENCRYPTION_KEY=<generate-with-crypto-randomBytes>

# Email OAuth providers
GMAIL_CLIENT_ID=your-gmail-oauth-client-id
GMAIL_CLIENT_SECRET=your-gmail-oauth-client-secret
OUTLOOK_CLIENT_ID=your-outlook-oauth-client-id
OUTLOOK_CLIENT_SECRET=your-outlook-oauth-client-secret
```

### Microservices (Optional)

Configure only if you're using these services:

```bash
SCRAPER_SERVICE_URL=https://scraper.yourdomain.com
SCRAPER_SERVICE_KEY=your-api-key
RESUME_AI_SERVICE_URL=https://resume-ai.yourdomain.com
RESUME_AI_SERVICE_KEY=your-api-key
# ... etc
```

### Security Variables

```bash
# Admin endpoints protection
ADMIN_API_KEY=<generate-with-openssl-rand-base64-32>

# Webhook verification
WEBHOOK_SECRET=<generate-with-openssl-rand-base64-32>

# Cron endpoint protection
CRON_SECRET=<generate-with-openssl-rand-base64-32>
```

### Generate Secure Keys

```bash
# Generate JWT_SECRET, ADMIN_API_KEY, WEBHOOK_SECRET, CRON_SECRET
openssl rand -base64 32

# Generate ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Database Setup

### 1. Create PostgreSQL Database

We recommend using [Neon](https://neon.tech) for serverless PostgreSQL:

```bash
# Create a new project on Neon
# Copy the connection string
```

Or use any PostgreSQL provider (AWS RDS, DigitalOcean, etc.).

### 2. Run Database Migrations

Before first deployment:

```bash
# Install dependencies
npm install

# Generate migration files (if schema changed)
npm run db:generate

# Push schema to database
npm run db:push

# OR run migrations
npm run db:migrate
```

### 3. Seed Initial Data (Optional)

```bash
npm run db:seed
```

### 4. Verify Database Connection

Test the connection:

```bash
# In your deployment environment
DATABASE_URL=postgresql://... npm run typecheck
```

## CORS Configuration

### Development

```bash
ALLOWED_ORIGINS=http://localhost:3000
```

### Production

**Single Frontend:**
```bash
ALLOWED_ORIGINS=https://app.yourdomain.com
```

**Multiple Environments:**
```bash
ALLOWED_ORIGINS=https://app.yourdomain.com,https://staging.yourdomain.com
```

### Important CORS Notes

1. ⚠️ **Do NOT use wildcards (`*`)** in production
2. ✅ Use exact URLs including protocol (`https://`)
3. ✅ Separate multiple origins with commas (no spaces)
4. ✅ Include all frontend domains that will call your API
5. ⚠️ Requests from unlisted origins will be blocked

### Common CORS Issues

**Problem:** Frontend gets CORS error
```
Access to fetch at 'https://api.yourdomain.com/api/jobs' from origin 
'https://app.yourdomain.com' has been blocked by CORS policy
```

**Solution:** Add frontend URL to `ALLOWED_ORIGINS`:
```bash
ALLOWED_ORIGINS=https://app.yourdomain.com
```

## Deployment Platforms

### Vercel (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Configure `vercel.json`** (already included)
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "src/index.ts",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "src/index.ts"
       }
     ]
   }
   ```

3. **Deploy**
   ```bash
   # First deployment
   vercel

   # Production deployment
   vercel --prod
   ```

4. **Set Environment Variables**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all required variables
   - Redeploy for changes to take effect

### Docker

1. **Create `Dockerfile`**
   ```dockerfile
   FROM node:18-alpine
   
   WORKDIR /app
   
   COPY package*.json ./
   RUN npm ci --production
   
   COPY . .
   RUN npm run build
   
   EXPOSE 8787
   
   CMD ["npm", "start"]
   ```

2. **Build and Run**
   ```bash
   docker build -t job-swiper-server .
   docker run -p 8787:8787 --env-file .env job-swiper-server
   ```

### Railway

1. **Connect GitHub Repository**
   - Go to Railway.app
   - Create new project from GitHub repo

2. **Configure Environment Variables**
   - Add all required variables in Railway dashboard

3. **Deploy**
   - Automatic deployment on git push

### Render

1. **Create Web Service**
   - Connect your GitHub repository
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`

2. **Add Environment Variables**
   - Add all required variables in Render dashboard

3. **Deploy**
   - Automatic deployment on git push

## Post-Deployment

### 1. Verify Health Check

```bash
curl https://api.yourdomain.com/
```

Expected response:
```json
{
  "success": true,
  "data": {
    "message": "Job Swiper API Server",
    "version": "1.0.0",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Test Authentication

Register a test user:
```bash
curl -X POST https://api.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

### 3. Test CORS

From your frontend:
```javascript
fetch('https://api.yourdomain.com/api/jobs', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  credentials: 'include'
})
```

### 4. Set Up Cron Jobs (Optional)

For automated job scraping every 2 hours:

**Vercel Cron:**
```json
{
  "crons": [{
    "path": "/api/sync",
    "schedule": "0 */2 * * *"
  }]
}
```

**External Cron (cron-job.org, EasyCron):**
- URL: `https://api.yourdomain.com/api/sync`
- Method: POST
- Schedule: Every 2 hours
- Headers: `Authorization: Bearer YOUR_CRON_SECRET`

## Monitoring and Maintenance

### Logging

Production logs are output to stdout in JSON format:

```bash
# View Vercel logs
vercel logs

# View Docker logs
docker logs <container-id>
```

### Database Maintenance

```bash
# Backup database regularly
pg_dump DATABASE_URL > backup.sql

# Monitor database size
# Check your PostgreSQL provider dashboard
```

### S3 Storage Monitoring

- Monitor bucket size
- Set up lifecycle policies for old files
- Configure CDN (CloudFlare) for faster downloads

### Health Monitoring

Set up uptime monitoring:
- [UptimeRobot](https://uptimerobot.com)
- [Pingdom](https://www.pingdom.com)
- [Better Uptime](https://betteruptime.com)

Monitor endpoint: `https://api.yourdomain.com/api/health`

## Troubleshooting

### Server Won't Start

1. **Check Required Variables**
   ```bash
   # Ensure these are set:
   echo $DATABASE_URL
   echo $JWT_SECRET
   echo $S3_BUCKET
   ```

2. **Check Database Connection**
   ```bash
   # Test database connectivity
   psql $DATABASE_URL -c "SELECT NOW();"
   ```

3. **Check Logs**
   ```bash
   # Look for startup errors
   vercel logs
   ```

### CORS Errors

1. **Verify ALLOWED_ORIGINS**
   ```bash
   # Must include your frontend URL
   ALLOWED_ORIGINS=https://app.yourdomain.com
   ```

2. **Check Frontend URL**
   - Ensure exact match (including https://)
   - No trailing slash
   - No wildcard

3. **Clear Browser Cache**
   - CORS headers can be cached
   - Hard refresh (Ctrl+Shift+R)

### Authentication Issues

1. **Invalid JWT Errors**
   - Ensure JWT_SECRET is the same across all server instances
   - Check token expiration (JWT_EXPIRES_IN)

2. **OAuth Not Working**
   - Verify callback URLs in OAuth provider settings
   - Check NEXTAUTH_URL matches your API domain
   - Ensure GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID are set

### Database Migration Issues

1. **Schema Mismatch**
   ```bash
   # Reset and reapply migrations
   npm run db:push
   ```

2. **Connection Pool Exhausted**
   - Increase database connection limit
   - Check for connection leaks in code

### File Upload Issues

1. **S3 Connection Errors**
   - Verify S3_ACCESS_KEY and S3_SECRET_KEY
   - Check bucket permissions
   - Verify S3_ENDPOINT URL

2. **File Size Limits**
   - Adjust platform limits (Vercel: 4.5MB)
   - Consider direct S3 uploads for large files

## Security Checklist

Before going to production:

- [ ] All secrets generated with secure random values
- [ ] `JWT_SECRET` is kept secret and never committed
- [ ] CORS configured with exact frontend URLs
- [ ] HTTPS enabled on both frontend and backend
- [ ] Database credentials secured
- [ ] S3 bucket permissions properly configured
- [ ] Rate limiting enabled (default: 100 req/min)
- [ ] Admin endpoints protected with `ADMIN_API_KEY`
- [ ] Webhook endpoints protected with `WEBHOOK_SECRET`
- [ ] Cron endpoints protected with `CRON_SECRET` or network rules
- [ ] Error messages don't leak sensitive information
- [ ] Logging doesn't include passwords or tokens

## Support

For issues or questions:
- Check existing issues on GitHub
- Review API documentation in `docs/API.md`
- Check application workflow in `docs/WORKFLOW.md`

## Repository Naming Note

⚠️ **Note:** This repository is named `job-swipper-server` (with double 'p'), while the client repository is `job-swiper` (single 'p'). This naming inconsistency is intentional and should not cause any functional issues, but be aware when referencing repository names.
