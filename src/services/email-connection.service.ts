import { db } from '../lib/db';
import { emailConnections } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { logger } from '../middleware/logger';
import nodemailer from 'nodemailer';
import { encryptCredentials, decryptCredentials } from '../lib/encryption';
import { credentialTransmissionService } from './credential-transmission.service';

export type EmailProvider = 'gmail' | 'outlook' | 'yahoo' | 'imap';

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export const emailConnectionService = {
  /**
   * List all email connections for a user
   */
  async listConnections(userId: string) {
    const connections = await db
      .select({
        id: emailConnections.id,
        provider: emailConnections.provider,
        email: emailConnections.email,
        isActive: emailConnections.isActive,
        createdAt: emailConnections.createdAt,
      })
      .from(emailConnections)
      .where(eq(emailConnections.userId, userId));

    return connections;
  },

  /**
   * Get connection by ID
   */
  async getConnection(userId: string, connectionId: string) {
    const result = await db
      .select()
      .from(emailConnections)
      .where(and(eq(emailConnections.id, connectionId), eq(emailConnections.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Email connection');
    }

    return result[0];
  },

  /**
   * Get connection with automatic token refresh if expired
   * Use this method when you need to use the credentials
   */
  async getConnectionWithValidToken(userId: string, connectionId: string) {
    logger.info({ userId, connectionId }, 'Retrieving connection with token validation');
    
    const connection = await this.getConnection(userId, connectionId);

    // Skip validation for IMAP connections
    if (connection.provider === 'imap') {
      logger.info({ connectionId, provider: 'imap' }, 'IMAP connection does not require token validation');
      return connection;
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (connection.tokenExpiresAt && connection.tokenExpiresAt < fiveMinutesFromNow) {
      logger.info(
        { 
          connectionId, 
          provider: connection.provider, 
          expiresAt: connection.tokenExpiresAt,
          status: 'expired_or_expiring_soon'
        },
        'Token expired or expiring soon, refreshing'
      );

      // Refresh the token
      await this.refreshOAuthToken(connectionId);
      
      // Retrieve the updated connection
      const refreshedConnection = await this.getConnection(userId, connectionId);
      
      logger.info(
        { 
          connectionId, 
          provider: refreshedConnection.provider,
          newExpiresAt: refreshedConnection.tokenExpiresAt,
          status: 'refreshed'
        },
        'Token successfully refreshed'
      );
      
      return refreshedConnection;
    }

    logger.info(
      { 
        connectionId, 
        provider: connection.provider,
        expiresAt: connection.tokenExpiresAt,
        status: 'valid'
      },
      'Token is valid and not expiring soon'
    );

    return connection;
  },

  /**
   * Validate that a connection has valid credentials
   * Returns true if credentials exist and are valid
   */
  async validateConnection(userId: string, connectionId: string): Promise<boolean> {
    logger.info({ userId, connectionId }, 'Validating connection credentials');
    
    try {
      const connection = await this.getConnection(userId, connectionId);

      // For IMAP, check if credentials exist
      if (connection.provider === 'imap') {
        const hasImapCreds = !!(
          connection.imapHost &&
          connection.imapPort &&
          connection.imapUsername &&
          (connection.imapPassword || connection.encryptedImapPassword)
        );
        
        logger.info(
          { connectionId, provider: 'imap', hasCredentials: hasImapCreds },
          'IMAP credential validation result'
        );
        
        return hasImapCreds;
      }

      // For OAuth, check if tokens exist and are not expired
      // Note: null tokenExpiresAt is treated as valid (never expires)
      // This is consistent with getConnectionWithValidToken which only refreshes
      // when tokenExpiresAt exists AND is expiring soon
      const hasAccessToken = !!(connection.accessToken || connection.encryptedAccessToken);
      const hasRefreshToken = !!(connection.refreshToken || connection.encryptedRefreshToken);
      const isNotExpired = !connection.tokenExpiresAt || connection.tokenExpiresAt > new Date();

      const isValid = hasAccessToken && hasRefreshToken && isNotExpired;
      
      logger.info(
        { 
          connectionId, 
          provider: connection.provider,
          hasAccessToken,
          hasRefreshToken,
          isNotExpired,
          isValid
        },
        'OAuth credential validation result'
      );

      return isValid;
    } catch (error) {
      logger.error({ error, userId, connectionId }, 'Error validating connection');
      return false;
    }
  },

  /**
   * Start Gmail OAuth flow
   * Returns the OAuth authorization URL
   */
  async startGmailOAuth(userId: string, redirectUri: string): Promise<string> {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const scope = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly';
    
    if (!clientId) {
      throw new Error('Gmail OAuth not configured');
    }

    const state = Buffer.from(JSON.stringify({ userId, provider: 'gmail' })).toString('base64');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${state}` +
      `&access_type=offline` +
      `&prompt=consent`;

    return authUrl;
  },

  /**
   * Complete Gmail OAuth flow
   */
  async completeGmailOAuth(userId: string, code: string, redirectUri: string): Promise<any> {
    logger.info({ userId, provider: 'gmail' }, 'Starting Gmail OAuth completion');
    
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.error({ userId }, 'Gmail OAuth not configured - missing client credentials');
      throw new Error('Gmail OAuth not configured');
    }

    logger.info({ userId }, 'Exchanging authorization code for tokens');

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error({ error, userId }, 'Failed to exchange Gmail OAuth code');
      throw new Error('Failed to authenticate with Gmail');
    }

    const tokens = await tokenResponse.json() as OAuthTokenResponse;

    // Validate token response
    if (!tokens.access_token) {
      logger.error({ userId }, 'Gmail OAuth response missing access token');
      throw new Error('Invalid token response from Gmail');
    }

    if (!tokens.refresh_token) {
      logger.warn({ userId }, 'Gmail OAuth response missing refresh token - may need to revoke access and retry');
    }

    logger.info({ userId, hasRefreshToken: !!tokens.refresh_token }, 'Successfully received OAuth tokens');

    // Get and validate user email from Google
    logger.info({ userId }, 'Fetching user info from Google');
    
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      logger.error({ userId, status: userInfoResponse.status }, 'Failed to fetch Gmail user info');
      throw new Error('Failed to fetch user information from Gmail');
    }

    const userInfo: any = await userInfoResponse.json();
    const email = userInfo.email;

    if (!email) {
      logger.error({ userId }, 'Gmail user info missing email address');
      throw new Error('Unable to retrieve email address from Gmail');
    }

    logger.info({ userId, email }, 'Successfully validated user email');

    // Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    logger.info(
      { 
        userId, 
        email, 
        expiresIn: tokens.expires_in,
        expiresAt: tokenExpiresAt
      },
      'Token expiry calculated'
    );

    // Encrypt credentials before storage
    logger.info({ userId, email }, 'Encrypting credentials for secure storage');
    
    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    // Save connection with encrypted credentials
    logger.info({ userId, email }, 'Saving Gmail connection to database');
    
    const [connection] = await db
      .insert(emailConnections)
      .values({
        userId,
        provider: 'gmail',
        email,
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        encryptionIv: encrypted.encryptionIv,
        tokenExpiresAt,
        isActive: true,
      })
      .returning();

    logger.info({ userId, email, provider: 'gmail' }, 'Gmail connection added');

    // Send credentials to Stage Updater microservice (non-blocking)
    // Note: Credentials are sent in plaintext to the microservice over HTTPS/TLS
    // This is by design - the Stage Updater needs plaintext credentials to use them
    // Security: HTTPS/TLS encryption + API key authentication protects data in transit
    // Don't await - let it happen in the background
    credentialTransmissionService.sendCredentials(
      userId,
      'gmail',
      {
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      }
    ).catch((error) => {
      logger.error(
        { userId, email, provider: 'gmail', error: error.message },
        'Failed to send credentials to Stage Updater'
      );
    });

    return connection;
  },

  /**
   * Start Outlook OAuth flow
   */
  async startOutlookOAuth(userId: string, redirectUri: string): Promise<string> {
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const scope = 'https://outlook.office.com/Mail.Send https://outlook.office.com/Mail.Read offline_access';
    
    if (!clientId) {
      throw new Error('Outlook OAuth not configured');
    }

    const state = Buffer.from(JSON.stringify({ userId, provider: 'outlook' })).toString('base64');

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${state}`;

    return authUrl;
  },

  /**
   * Complete Outlook OAuth flow
   */
  async completeOutlookOAuth(userId: string, code: string, redirectUri: string): Promise<any> {
    logger.info({ userId, provider: 'outlook' }, 'Starting Outlook OAuth completion');
    
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.error({ userId }, 'Outlook OAuth not configured - missing client credentials');
      throw new Error('Outlook OAuth not configured');
    }

    logger.info({ userId }, 'Exchanging authorization code for tokens');

    // Exchange code for tokens
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error({ error, userId }, 'Failed to exchange Outlook OAuth code');
      throw new Error('Failed to authenticate with Outlook');
    }

    const tokens = await tokenResponse.json() as OAuthTokenResponse;

    // Validate token response
    if (!tokens.access_token) {
      logger.error({ userId }, 'Outlook OAuth response missing access token');
      throw new Error('Invalid token response from Outlook');
    }

    if (!tokens.refresh_token) {
      logger.warn({ userId }, 'Outlook OAuth response missing refresh token');
    }

    logger.info({ userId, hasRefreshToken: !!tokens.refresh_token }, 'Successfully received OAuth tokens');

    // Get and validate user email from Microsoft Graph
    logger.info({ userId }, 'Fetching user info from Microsoft Graph');
    
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      logger.error({ userId, status: userInfoResponse.status }, 'Failed to fetch Outlook user info');
      throw new Error('Failed to fetch user information from Outlook');
    }

    const userInfo: any = await userInfoResponse.json();
    const email = userInfo.mail || userInfo.userPrincipalName;

    if (!email) {
      logger.error({ userId }, 'Outlook user info missing email address');
      throw new Error('Unable to retrieve email address from Outlook');
    }

    logger.info({ userId, email }, 'Successfully validated user email');

    // Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    logger.info(
      { 
        userId, 
        email, 
        expiresIn: tokens.expires_in,
        expiresAt: tokenExpiresAt
      },
      'Token expiry calculated'
    );

    // Encrypt credentials before storage
    logger.info({ userId, email }, 'Encrypting credentials for secure storage');
    
    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    // Save connection with encrypted credentials
    logger.info({ userId, email }, 'Saving Outlook connection to database');
    
    const [connection] = await db
      .insert(emailConnections)
      .values({
        userId,
        provider: 'outlook',
        email,
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        encryptionIv: encrypted.encryptionIv,
        tokenExpiresAt,
        isActive: true,
      })
      .returning();

    logger.info({ userId, email, provider: 'outlook' }, 'Outlook connection added');

    // Send credentials to Stage Updater microservice (non-blocking)
    credentialTransmissionService.sendCredentials(
      userId,
      'outlook',
      {
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      }
    ).catch((error) => {
      logger.error(
        { userId, email, provider: 'outlook', error: error.message },
        'Failed to send credentials to Stage Updater'
      );
    });

    return connection;
  },

  /**
   * Start Yahoo OAuth flow
   */
  async startYahooOAuth(userId: string, redirectUri: string): Promise<string> {
    const clientId = process.env.YAHOO_CLIENT_ID;
    const scope = 'mail-w mail-r';
    
    if (!clientId) {
      throw new Error('Yahoo OAuth not configured');
    }

    const state = Buffer.from(JSON.stringify({ userId, provider: 'yahoo' })).toString('base64');

    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${state}`;

    return authUrl;
  },

  /**
   * Complete Yahoo OAuth flow
   */
  async completeYahooOAuth(userId: string, code: string, redirectUri: string): Promise<any> {
    logger.info({ userId, provider: 'yahoo' }, 'Starting Yahoo OAuth completion');
    
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.error({ userId }, 'Yahoo OAuth not configured - missing client credentials');
      throw new Error('Yahoo OAuth not configured');
    }

    logger.info({ userId }, 'Exchanging authorization code for tokens');

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error({ error, userId }, 'Failed to exchange Yahoo OAuth code');
      throw new Error('Failed to authenticate with Yahoo');
    }

    const tokens = await tokenResponse.json() as OAuthTokenResponse;

    // Validate token response
    if (!tokens.access_token) {
      logger.error({ userId }, 'Yahoo OAuth response missing access token');
      throw new Error('Invalid token response from Yahoo');
    }

    if (!tokens.refresh_token) {
      logger.warn({ userId }, 'Yahoo OAuth response missing refresh token');
    }

    logger.info({ userId, hasRefreshToken: !!tokens.refresh_token }, 'Successfully received OAuth tokens');

    // Get and validate user email from Yahoo userinfo
    logger.info({ userId }, 'Fetching user info from Yahoo');
    
    const userInfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      logger.error({ userId, status: userInfoResponse.status }, 'Failed to fetch Yahoo user info');
      throw new Error('Failed to fetch user information from Yahoo');
    }

    const userInfo: any = await userInfoResponse.json();
    const email = userInfo.email;

    if (!email) {
      logger.error({ userId }, 'Yahoo user info missing email address');
      throw new Error('Unable to retrieve email address from Yahoo');
    }

    logger.info({ userId, email }, 'Successfully validated user email');

    // Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    logger.info(
      { 
        userId, 
        email, 
        expiresIn: tokens.expires_in,
        expiresAt: tokenExpiresAt
      },
      'Token expiry calculated'
    );

    // Encrypt credentials before storage
    logger.info({ userId, email }, 'Encrypting credentials for secure storage');
    
    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    // Save connection with encrypted credentials
    logger.info({ userId, email }, 'Saving Yahoo connection to database');
    
    const [connection] = await db
      .insert(emailConnections)
      .values({
        userId,
        provider: 'yahoo',
        email,
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        encryptionIv: encrypted.encryptionIv,
        tokenExpiresAt,
        isActive: true,
      })
      .returning();

    logger.info({ userId, email, provider: 'yahoo' }, 'Yahoo connection added');

    // Send credentials to Stage Updater microservice (non-blocking)
    credentialTransmissionService.sendCredentials(
      userId,
      'yahoo',
      {
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      }
    ).catch((error) => {
      logger.error(
        { userId, email, provider: 'yahoo', error: error.message },
        'Failed to send credentials to Stage Updater'
      );
    });

    return connection;
  },

  /**
   * Add IMAP connection
   */
  async addImapConnection(
    userId: string,
    email: string,
    host: string,
    port: number,
    username: string,
    password: string
  ): Promise<any> {
    logger.info({ userId, email, host, port, provider: 'imap' }, 'Adding IMAP connection');
    
    // Encrypt IMAP password before storage
    logger.info({ userId, email }, 'Encrypting IMAP password for secure storage');
    
    const encrypted = encryptCredentials({
      imapPassword: password,
    });

    // Save connection with encrypted credentials
    logger.info({ userId, email }, 'Saving IMAP connection to database');
    
    const [connection] = await db
      .insert(emailConnections)
      .values({
        userId,
        provider: 'imap',
        email,
        imapHost: host,
        imapPort: port,
        imapUsername: username,
        encryptedImapPassword: encrypted.encryptedImapPassword,
        encryptionIv: encrypted.encryptionIv,
        isActive: true,
      })
      .returning();

    logger.info({ userId, email, provider: 'imap' }, 'IMAP connection added');

    // Send credentials to Stage Updater microservice (non-blocking)
    credentialTransmissionService.sendCredentials(
      userId,
      'imap',
      {
        email,
        imapServer: host,
        imapPort: port,
        imapUsername: username,
        imapPassword: password,
      }
    ).catch((error) => {
      logger.error(
        { userId, email, provider: 'imap', error: error.message },
        'Failed to send credentials to Stage Updater'
      );
    });

    return connection;
  },

  /**
   * Test IMAP connection
   * Validates credentials by attempting to connect to the IMAP server
   */
  async testImapConnection(host: string, port: number, username: string, password: string): Promise<boolean> {
    logger.info({ host, port, username }, 'Testing IMAP connection');
    
    try {
      // Validate input parameters
      if (!host || !username || !password) {
        logger.error({ host, port, username }, 'Missing required IMAP credentials');
        return false;
      }

      // Create a transporter with the IMAP credentials
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 993, // Use SSL/TLS for port 993
        auth: {
          user: username,
          pass: password,
        },
        // Increase timeout for slow servers
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });

      logger.info({ host, port, username }, 'Verifying IMAP server connection');

      // Verify the connection
      await transporter.verify();
      
      logger.info({ host, port, username }, 'IMAP connection test successful');
      return true;
    } catch (error) {
      logger.error({ error, host, port, username }, 'IMAP connection test failed');
      return false;
    }
  },

  /**
   * Test existing connection
   */
  async testConnection(userId: string, connectionId: string): Promise<boolean> {
    const connection = await this.getConnection(userId, connectionId);

    if (connection.provider === 'imap') {
      // Decrypt IMAP password if encrypted
      let password: string | null = connection.imapPassword;
      if (!password && connection.encryptedImapPassword && connection.encryptionIv) {
        const decrypted = decryptCredentials({
          encryptedImapPassword: connection.encryptedImapPassword,
          encryptionIv: connection.encryptionIv,
        });
        password = decrypted.imapPassword || null;
      }

      if (!password) {
        return false;
      }

      return this.testImapConnection(
        connection.imapHost!,
        connection.imapPort!,
        connection.imapUsername!,
        password
      );
    } else {
      // For OAuth providers, check if encrypted or plaintext token exists
      return !!(connection.accessToken || connection.encryptedAccessToken);
    }
  },

  /**
   * Remove email connection
   */
  async removeConnection(userId: string, connectionId: string): Promise<void> {
    await this.getConnection(userId, connectionId); // Verify ownership

    await db
      .delete(emailConnections)
      .where(eq(emailConnections.id, connectionId));

    logger.info({ userId, connectionId }, 'Email connection removed');
  },

  /**
   * Refresh OAuth token if expired
   */
  async refreshOAuthToken(connectionId: string): Promise<void> {
    logger.info({ connectionId }, 'Starting OAuth token refresh');
    
    const connection = await db
      .select()
      .from(emailConnections)
      .where(eq(emailConnections.id, connectionId))
      .limit(1);

    if (connection.length === 0) {
      logger.error({ connectionId }, 'Connection not found for token refresh');
      throw new NotFoundError('Email connection');
    }

    const conn = connection[0];

    logger.info(
      { 
        connectionId, 
        provider: conn.provider,
        expiresAt: conn.tokenExpiresAt
      },
      'Checking if token needs refresh'
    );

    // Check if token needs refresh
    if (!conn.tokenExpiresAt || conn.tokenExpiresAt > new Date()) {
      logger.info({ connectionId, provider: conn.provider }, 'Token still valid, no refresh needed');
      return; // Token still valid
    }

    logger.info({ connectionId, provider: conn.provider }, 'Token expired, refreshing');

    // Get refresh token (decrypt if necessary)
    let refreshToken: string | null = conn.refreshToken;
    if (!refreshToken && conn.encryptedRefreshToken && conn.encryptionIv) {
      logger.info({ connectionId }, 'Decrypting refresh token');
      const decrypted = decryptCredentials({
        encryptedRefreshToken: conn.encryptedRefreshToken,
        encryptionIv: conn.encryptionIv,
      });
      refreshToken = decrypted.refreshToken || null;
    }

    if (!refreshToken) {
      logger.error({ connectionId, provider: conn.provider }, 'No refresh token available');
      throw new Error('No refresh token available');
    }

    logger.info({ connectionId, provider: conn.provider }, 'Requesting new access token from provider');

    // Refresh based on provider
    let tokenResponse: Response;
    let clientId: string | undefined;
    let clientSecret: string | undefined;

    switch (conn.provider) {
      case 'gmail':
        clientId = process.env.GMAIL_CLIENT_ID;
        clientSecret = process.env.GMAIL_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          logger.error({ connectionId, provider: 'gmail' }, 'Gmail OAuth credentials not configured');
          throw new Error('Gmail OAuth not configured');
        }
        
        tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
          }),
        });
        break;

      case 'outlook':
        clientId = process.env.OUTLOOK_CLIENT_ID;
        clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          logger.error({ connectionId, provider: 'outlook' }, 'Outlook OAuth credentials not configured');
          throw new Error('Outlook OAuth not configured');
        }
        
        tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
          }),
        });
        break;

      case 'yahoo':
        clientId = process.env.YAHOO_CLIENT_ID;
        clientSecret = process.env.YAHOO_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          logger.error({ connectionId, provider: 'yahoo' }, 'Yahoo OAuth credentials not configured');
          throw new Error('Yahoo OAuth not configured');
        }
        
        tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });
        break;

      default:
        throw new Error(`Unsupported provider: ${conn.provider}`);
    }

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      logger.error({ error, provider: conn.provider }, 'Failed to refresh OAuth token');
      throw new Error('Failed to refresh token');
    }

    const tokens = await tokenResponse.json() as OAuthTokenResponse;

    // Update connection with new encrypted credentials
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    logger.info(
      { 
        connectionId, 
        provider: conn.provider,
        newExpiresAt: tokenExpiresAt
      },
      'Encrypting and saving new tokens'
    );

    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
    });

    // Log if we're falling back to old refresh token
    if (!tokens.refresh_token && refreshToken) {
      logger.warn(
        { connectionId, provider: conn.provider },
        'OAuth provider did not return new refresh token, using existing one (may be invalid if provider rotates tokens)'
      );
    }

    await db
      .update(emailConnections)
      .set({
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        encryptionIv: encrypted.encryptionIv,
        tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(emailConnections.id, connectionId));

    logger.info(
      { 
        connectionId, 
        provider: conn.provider,
        newExpiresAt: tokenExpiresAt
      },
      'OAuth token successfully refreshed and saved'
    );
  },

  /**
   * Manually sync credentials to Stage Updater microservice
   * Useful for retrying failed transmissions or updating existing connections
   */
  async syncCredentialsToStageUpdater(
    userId: string,
    connectionId: string,
    requestId?: string
  ): Promise<{ success: boolean; message: string }> {
    logger.info({ userId, connectionId, requestId }, 'Starting manual credential sync to Stage Updater');
    
    // Get connection with token validation and auto-refresh
    const connection = await this.getConnectionWithValidToken(userId, connectionId);

    // Prepare credentials based on provider type
    const credentials: any = {
      email: connection.email,
    };

    if (connection.provider === 'imap') {
      logger.info({ connectionId, provider: 'imap' }, 'Preparing IMAP credentials for sync');
      
      // Decrypt IMAP password only
      const decrypted = decryptCredentials({
        encryptedImapPassword: connection.encryptedImapPassword,
        encryptionIv: connection.encryptionIv,
      });

      credentials.imapServer = connection.imapHost;
      credentials.imapPort = connection.imapPort;
      credentials.imapUsername = connection.imapUsername;
      credentials.imapPassword = decrypted.imapPassword;
    } else {
      logger.info({ connectionId, provider: connection.provider }, 'Preparing OAuth credentials for sync');
      
      // Decrypt OAuth tokens for Gmail/Outlook/Yahoo
      const decrypted = decryptCredentials({
        encryptedAccessToken: connection.encryptedAccessToken,
        encryptedRefreshToken: connection.encryptedRefreshToken,
        encryptionIv: connection.encryptionIv,
      });

      credentials.accessToken = decrypted.accessToken;
      credentials.refreshToken = decrypted.refreshToken;
    }

    // Send to Stage Updater
    logger.info({ userId, connectionId, provider: connection.provider }, 'Sending credentials to Stage Updater');
    
    await credentialTransmissionService.sendCredentials(
      userId,
      connection.provider as any,
      credentials,
      { requestId }
    );

    logger.info(
      { userId, connectionId, provider: connection.provider, requestId },
      'Successfully synced credentials to Stage Updater'
    );

    return {
      success: true,
      message: 'Credentials successfully sent to Stage Updater',
    };
  },
};
