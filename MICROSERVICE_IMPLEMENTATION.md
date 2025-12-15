# Stage Updater Microservice - Implementation Guide

This document provides guidance for implementing the `/email-credentials` endpoint in the Stage Updater microservice.

## API Specification

### Endpoint
```
POST /email-credentials
```

### Authentication
- **Type**: Bearer Token (API Key)
- **Header**: `Authorization: Bearer <STAGE_UPDATER_SERVICE_KEY>`

### Request Headers
```
Content-Type: application/json
Authorization: Bearer <api-key>
X-Request-ID: <optional-request-id>
```

### Request Body

#### For OAuth Providers (Gmail, Outlook, Yahoo)
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "gmail",
  "credentials": {
    "email": "user@gmail.com",
    "accessToken": "ya29.a0AfH6SMBx...",
    "refreshToken": "1//0gX5..."
  }
}
```

#### For IMAP Provider
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "imap",
  "credentials": {
    "email": "user@example.com",
    "imapServer": "imap.example.com",
    "imapPort": 993,
    "imapUsername": "user@example.com",
    "imapPassword": "password123"
  }
}
```

### Response

#### Success
```json
{
  "success": true,
  "message": "Credentials received and validated"
}
```
Status Code: `200 OK`

#### Error
```json
{
  "success": false,
  "error": "Invalid credentials: IMAP connection failed"
}
```
Status Code: `400 Bad Request` or `422 Unprocessable Entity`

## TypeScript Types

```typescript
type EmailProvider = 'gmail' | 'yahoo' | 'outlook' | 'imap';

interface EmailCredentials {
  email: string;
  accessToken?: string;
  refreshToken?: string;
  imapServer?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
}

interface EmailCredentialsRequest {
  userId: string;
  provider: EmailProvider;
  credentials: EmailCredentials;
}

interface EmailCredentialsResponse {
  success: boolean;
  message?: string;
  error?: string;
}
```

## Implementation Checklist

### 1. Basic Setup
- [ ] Create POST endpoint at `/email-credentials`
- [ ] Add API key authentication middleware
- [ ] Validate request body structure
- [ ] Add request logging (without exposing credentials)

### 2. Input Validation
- [ ] Validate `userId` is a valid UUID
- [ ] Validate `provider` is one of: gmail, yahoo, outlook, imap
- [ ] Validate `email` is a valid email address
- [ ] Validate provider-specific required fields:
  - OAuth: `accessToken` required
  - IMAP: `imapServer`, `imapPort`, `imapUsername`, `imapPassword` required

### 3. Credential Testing
- [ ] For IMAP: Test connection to IMAP server
- [ ] For Gmail: Validate token with Google API
- [ ] For Outlook: Validate token with Microsoft Graph API
- [ ] For Yahoo: Validate token with Yahoo API
- [ ] Return appropriate error if validation fails

### 4. Credential Storage
- [ ] Store credentials in secure database (encrypted)
- [ ] Associate credentials with userId
- [ ] Update existing credentials if they already exist
- [ ] Handle concurrent updates gracefully

### 5. Error Handling
- [ ] Handle invalid credentials gracefully
- [ ] Handle network errors (IMAP/API timeouts)
- [ ] Handle duplicate credential updates
- [ ] Return meaningful error messages

### 6. Security
- [ ] Use HTTPS only
- [ ] Validate API key on every request
- [ ] Never log credentials in plaintext
- [ ] Encrypt credentials before storage
- [ ] Use parameterized queries to prevent SQL injection

### 7. Logging & Monitoring
- [ ] Log successful credential updates
- [ ] Log validation failures (without credentials)
- [ ] Monitor credential validation success rate
- [ ] Alert on repeated failures for same user

## Sample Implementation (Node.js/Express)

```javascript
import express from 'express';
import { z } from 'zod';

const router = express.Router();

// Validation schema
const credentialsSchema = z.object({
  userId: z.string().uuid(),
  provider: z.enum(['gmail', 'yahoo', 'outlook', 'imap']),
  credentials: z.object({
    email: z.string().email(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
    imapServer: z.string().optional(),
    imapPort: z.number().int().min(1).max(65535).optional(),
    imapUsername: z.string().optional(),
    imapPassword: z.string().optional(),
  }),
});

// API key authentication middleware
function authenticateApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.STAGE_UPDATER_SERVICE_KEY;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization header',
    });
  }

  const providedKey = authHeader.substring(7);
  if (providedKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      error: 'Invalid API key',
    });
  }

  next();
}

// Main endpoint
router.post('/email-credentials', authenticateApiKey, async (req, res) => {
  try {
    // Validate request body
    const validated = credentialsSchema.parse(req.body);
    const { userId, provider, credentials } = validated;

    // Log request (without exposing credentials)
    console.log(`Received credentials for user ${userId}, provider ${provider}`);

    // Validate credentials based on provider
    if (provider === 'imap') {
      await validateImapCredentials(credentials);
    } else {
      await validateOAuthCredentials(provider, credentials);
    }

    // Store credentials securely
    await storeCredentials(userId, provider, credentials);

    res.json({
      success: true,
      message: 'Credentials received and validated',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
      });
    }

    console.error('Error processing credentials:', error.message);
    res.status(422).json({
      success: false,
      error: error.message || 'Failed to process credentials',
    });
  }
});

// Validation functions
async function validateImapCredentials(credentials) {
  const { imapServer, imapPort, imapUsername, imapPassword } = credentials;

  if (!imapServer || !imapPort || !imapUsername || !imapPassword) {
    throw new Error('Missing required IMAP fields');
  }

  // Test IMAP connection
  const imap = require('imap');
  const client = new imap({
    host: imapServer,
    port: imapPort,
    user: imapUsername,
    password: imapPassword,
    tls: imapPort === 993,
  });

  return new Promise((resolve, reject) => {
    client.once('ready', () => {
      client.end();
      resolve();
    });

    client.once('error', (err) => {
      reject(new Error(`IMAP connection failed: ${err.message}`));
    });

    client.connect();
  });
}

async function validateOAuthCredentials(provider, credentials) {
  const { accessToken } = credentials;

  if (!accessToken) {
    throw new Error('Missing access token');
  }

  // Validate token with provider API
  let validationUrl;
  switch (provider) {
    case 'gmail':
      validationUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
      break;
    case 'outlook':
      validationUrl = 'https://graph.microsoft.com/v1.0/me';
      break;
    case 'yahoo':
      validationUrl = 'https://api.login.yahoo.com/openid/v1/userinfo';
      break;
  }

  const response = await fetch(validationUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Token validation failed for ${provider}`);
  }
}

async function storeCredentials(userId, provider, credentials) {
  // Implement secure storage
  // - Encrypt credentials before storing
  // - Use prepared statements
  // - Handle updates vs inserts
  console.log(`Storing credentials for user ${userId}`);
  // Your implementation here
}

export default router;
```

## Testing the Endpoint

### Using curl
```bash
curl -X POST https://your-stage-updater.com/email-credentials \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "gmail",
    "credentials": {
      "email": "user@gmail.com",
      "accessToken": "ya29.a0AfH6SMBx...",
      "refreshToken": "1//0gX5..."
    }
  }'
```

### Expected Response
```json
{
  "success": true,
  "message": "Credentials received and validated"
}
```

## Health Check Endpoint

Also implement a health check endpoint for connectivity testing:

```javascript
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});
```

## Security Recommendations

1. **Use HTTPS Only**: Configure your server to only accept HTTPS connections
2. **Rotate API Keys**: Regularly rotate the API key used for authentication
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **IP Whitelisting**: Consider restricting access to known IPs
5. **Audit Logging**: Log all credential updates for security audits
6. **Encryption at Rest**: Encrypt credentials before storing in database
7. **Secure Key Management**: Use environment variables or secrets manager for API keys

## Monitoring

Key metrics to monitor:
- Request rate to `/email-credentials`
- Success vs failure rate
- Average response time
- Validation failure reasons
- Credential update frequency per user

## Support

For questions or issues with the API specification, please refer to:
- Main documentation: `SECURE_CREDENTIALS.md`
- Security summary: `SECURITY_SUMMARY.md`
