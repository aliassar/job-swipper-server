# Secure Email Credential Transmission

This document describes the implementation of secure email credential storage and transmission to the Stage Updater microservice.

## Overview

The system encrypts email credentials (OAuth tokens and IMAP passwords) before storing them in the database and securely transmits them to the Stage Updater microservice.

## Features

### 1. **AES-GCM Encryption**
- 256-bit encryption key
- Unique initialization vector (IV) for each credential set
- Authentication tags for data integrity
- Located in: `src/lib/encryption.ts`

### 2. **Database Schema**
The `email_connections` table has been extended with encrypted fields:
- `encrypted_access_token` - Encrypted OAuth access token
- `encrypted_refresh_token` - Encrypted OAuth refresh token
- `encrypted_imap_password` - Encrypted IMAP password
- `encryption_iv` - Initialization vector for decryption

### 3. **Credential Transmission Service**
- Automatic retry logic with exponential backoff
- Configurable retry attempts (default: 3)
- Non-blocking credential transmission
- Located in: `src/services/credential-transmission.service.ts`

### 4. **API Endpoints**

#### Email Connection Management
- `GET /api/email-connections` - List all connections
- `POST /api/email-connections/gmail` - Start Gmail OAuth
- `POST /api/email-connections/outlook` - Start Outlook OAuth
- `POST /api/email-connections/yahoo` - Start Yahoo OAuth
- `POST /api/email-connections/imap` - Add IMAP connection
- `DELETE /api/email-connections/:id` - Remove connection
- `POST /api/email-connections/:id/test` - Test connection
- `POST /api/email-connections/:id/sync` - Manually sync credentials to Stage Updater

## Setup

### 1. Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the generated key to your `.env` file:

```env
ENCRYPTION_KEY=<your-generated-key>
```

### 2. Configure Stage Updater Service

Add to `.env`:

```env
STAGE_UPDATER_SERVICE_URL=https://your-stage-updater-service.com
STAGE_UPDATER_SERVICE_KEY=your-api-key
```

### 3. Configure OAuth Providers (Optional)

```env
GMAIL_CLIENT_ID=your-gmail-client-id
GMAIL_CLIENT_SECRET=your-gmail-client-secret
OUTLOOK_CLIENT_ID=your-outlook-client-id
OUTLOOK_CLIENT_SECRET=your-outlook-client-secret
YAHOO_CLIENT_ID=your-yahoo-client-id
YAHOO_CLIENT_SECRET=your-yahoo-client-secret
```

### 4. Run Database Migration

```bash
npm run db:push
```

## Usage

### Automatic Credential Transmission

When users connect their email accounts via OAuth or IMAP, credentials are automatically:
1. Encrypted using AES-GCM
2. Stored in the database
3. Transmitted to the Stage Updater microservice (non-blocking)

If transmission fails, it retries automatically with exponential backoff.

### Manual Credential Sync

To manually sync credentials (e.g., after microservice downtime):

```bash
POST /api/email-connections/:connectionId/sync
Authorization: Bearer <user-token>
```

Response:
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Credentials successfully sent to Stage Updater"
  },
  "meta": {
    "requestId": "req_123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Security Considerations

### Encryption
- Uses AES-256-GCM for confidentiality and authenticity
- Unique IV for each credential set prevents pattern analysis
- Encryption key must be 32 bytes (256 bits) when decoded from base64
- Key should be stored securely (e.g., environment variable, secret manager)

### Transport Security
- All API communications use HTTPS/TLS 1.2+
- Microservice communication authenticated via API keys (Bearer tokens)
- Credentials transmitted over secure channels only

### Input Validation
- All inputs validated using Zod schemas
- Email addresses validated
- IMAP server credentials tested before storage
- OAuth tokens validated with provider APIs

### Data Storage
- Legacy plaintext fields (`access_token`, `refresh_token`, `imap_password`) deprecated
- New encrypted fields used for all credential storage
- Database-level encryption recommended for additional security

## Migration from Plaintext

Existing plaintext credentials can be migrated by:
1. Reading the plaintext credential
2. Encrypting it using the encryption service
3. Updating the record with encrypted values
4. Clearing the plaintext field

Example:
```typescript
const encrypted = encryptCredentials({
  accessToken: connection.accessToken,
  refreshToken: connection.refreshToken,
});

await db.update(emailConnections)
  .set({
    encryptedAccessToken: encrypted.encryptedAccessToken,
    encryptedRefreshToken: encrypted.encryptedRefreshToken,
    encryptionIv: encrypted.encryptionIv,
    accessToken: null,
    refreshToken: null,
  })
  .where(eq(emailConnections.id, connectionId));
```

## Testing

Run tests:
```bash
npm test
```

Test coverage includes:
- Encryption/decryption functionality
- Credential transmission with retries
- Error handling
- Exponential backoff logic

## Troubleshooting

### Encryption Key Errors
- Ensure `ENCRYPTION_KEY` is set in `.env`
- Verify key is exactly 32 bytes when base64 decoded
- Don't commit the encryption key to version control

### Transmission Failures
- Check Stage Updater service is running
- Verify `STAGE_UPDATER_SERVICE_URL` and `STAGE_UPDATER_SERVICE_KEY` are correct
- Review logs for detailed error messages
- Use manual sync endpoint to retry transmission

### OAuth Issues
- Verify OAuth client IDs and secrets are correct
- Ensure redirect URIs are configured in OAuth provider console
- Check token expiration and refresh logic

## API Contract

### Stage Updater Service Expected Request

```typescript
POST /email-credentials
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "userId": "uuid",
  "provider": "gmail" | "yahoo" | "outlook" | "imap",
  "credentials": {
    "email": "user@example.com",
    // OAuth providers:
    "accessToken": "string",
    "refreshToken": "string",
    // IMAP provider:
    "imapServer": "imap.example.com",
    "imapPort": 993,
    "imapUsername": "string",
    "imapPassword": "string"
  }
}
```

### Expected Response

```typescript
{
  "success": boolean,
  "message"?: "string",
  "error"?: "string"
}
```

## Future Improvements

1. **Key Rotation**: Implement encryption key rotation mechanism
2. **Audit Logging**: Log all credential access and transmission attempts
3. **Rate Limiting**: Add rate limits for credential sync endpoints
4. **Webhook Support**: Notify UI when transmission fails/succeeds
5. **Batch Transmission**: Support syncing multiple connections at once
6. **Health Checks**: Add health check endpoint for Stage Updater service
