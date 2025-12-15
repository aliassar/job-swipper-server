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
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Gmail OAuth not configured');
    }

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
      logger.error({ error }, 'Failed to exchange Gmail OAuth code');
      throw new Error('Failed to authenticate with Gmail');
    }

    const tokens = await tokenResponse.json() as OAuthTokenResponse;

    // Get user email from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo: any = await userInfoResponse.json();
    const email = userInfo.email;

    // Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Encrypt credentials before storage
    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    // Save connection with encrypted credentials
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
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Outlook OAuth not configured');
    }

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
      logger.error({ error }, 'Failed to exchange Outlook OAuth code');
      throw new Error('Failed to authenticate with Outlook');
    }

    const tokens = await tokenResponse.json() as OAuthTokenResponse;

    // Get user email from Microsoft Graph
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo: any = await userInfoResponse.json();
    const email = userInfo.mail || userInfo.userPrincipalName;

    // Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Encrypt credentials before storage
    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    // Save connection with encrypted credentials
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
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Yahoo OAuth not configured');
    }

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
      logger.error({ error }, 'Failed to exchange Yahoo OAuth code');
      throw new Error('Failed to authenticate with Yahoo');
    }

    const tokens = await tokenResponse.json() as OAuthTokenResponse;

    // Get user email - Yahoo provides it in the token response or we need to call userinfo
    const userInfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo: any = await userInfoResponse.json();
    const email = userInfo.email;

    // Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Encrypt credentials before storage
    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    // Save connection with encrypted credentials
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
    // Encrypt IMAP password before storage
    const encrypted = encryptCredentials({
      imapPassword: password,
    });

    // Save connection with encrypted credentials
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
    try {
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
    const connection = await db
      .select()
      .from(emailConnections)
      .where(eq(emailConnections.id, connectionId))
      .limit(1);

    if (connection.length === 0) {
      throw new NotFoundError('Email connection');
    }

    const conn = connection[0];

    // Check if token needs refresh
    if (!conn.tokenExpiresAt || conn.tokenExpiresAt > new Date()) {
      return; // Token still valid
    }

    // Get refresh token (decrypt if necessary)
    let refreshToken: string | null = conn.refreshToken;
    if (!refreshToken && conn.encryptedRefreshToken && conn.encryptionIv) {
      const decrypted = decryptCredentials({
        encryptedRefreshToken: conn.encryptedRefreshToken,
        encryptionIv: conn.encryptionIv,
      });
      refreshToken = decrypted.refreshToken || null;
    }

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    // Refresh based on provider
    let tokenResponse: Response;
    let clientId: string | undefined;
    let clientSecret: string | undefined;

    switch (conn.provider) {
      case 'gmail':
        clientId = process.env.GMAIL_CLIENT_ID;
        clientSecret = process.env.GMAIL_CLIENT_SECRET;
        tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId!,
            client_secret: clientSecret!,
            grant_type: 'refresh_token',
          }),
        });
        break;

      case 'outlook':
        clientId = process.env.OUTLOOK_CLIENT_ID;
        clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
        tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: clientId!,
            client_secret: clientSecret!,
            grant_type: 'refresh_token',
          }),
        });
        break;

      case 'yahoo':
        clientId = process.env.YAHOO_CLIENT_ID;
        clientSecret = process.env.YAHOO_CLIENT_SECRET;
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

    const encrypted = encryptCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
    });

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

    logger.info({ connectionId, provider: conn.provider }, 'OAuth token refreshed');
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
    const connection = await this.getConnection(userId, connectionId);

    // Decrypt credentials
    const decrypted = decryptCredentials({
      encryptedAccessToken: connection.encryptedAccessToken,
      encryptedRefreshToken: connection.encryptedRefreshToken,
      encryptedImapPassword: connection.encryptedImapPassword,
      encryptionIv: connection.encryptionIv,
    });

    // Prepare credentials based on provider type
    const credentials: any = {
      email: connection.email,
    };

    if (connection.provider === 'imap') {
      credentials.imapServer = connection.imapHost;
      credentials.imapPort = connection.imapPort;
      credentials.imapUsername = connection.imapUsername;
      credentials.imapPassword = decrypted.imapPassword;
    } else {
      // OAuth providers
      credentials.accessToken = decrypted.accessToken;
      credentials.refreshToken = decrypted.refreshToken;
    }

    // Send to Stage Updater
    await credentialTransmissionService.sendCredentials(
      userId,
      connection.provider as any,
      credentials,
      { requestId }
    );

    logger.info(
      { userId, connectionId, provider: connection.provider, requestId },
      'Manually synced credentials to Stage Updater'
    );

    return {
      success: true,
      message: 'Credentials successfully sent to Stage Updater',
    };
  },
};
