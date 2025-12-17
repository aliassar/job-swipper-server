import { db } from '../lib/db';
import { passwordResetTokens, users, emailVerificationTokens } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { ValidationError, AuthenticationError } from '../lib/errors';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { emailClient } from '../lib/email-client';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export const authService = {
  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  },

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  /**
   * Generate a JWT token for a user
   */
  generateToken(user: AuthUser): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
    );
  },

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): AuthUser {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        email: string;
        emailVerified: boolean;
      };
      return {
        id: decoded.userId,
        email: decoded.email,
        emailVerified: decoded.emailVerified,
      };
    } catch (error) {
      throw new AuthenticationError('Invalid or expired token');
    }
  },

  /**
   * Register a new user with email/password
   */
  async register(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    console.log('Attempting to create user in DB:', email);

    try {
      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          emailVerified: false,
          oauthProvider: 'email',
        })
        .returning();

      console.log('User created:', newUser.id);

      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Token valid for 24 hours

      await db.insert(emailVerificationTokens).values({
        userId: newUser.id,
        token: verificationToken,
        expiresAt,
        used: false,
      });

      // Send verification email (don't fail registration if email fails)
      try {
        await emailClient.sendVerificationEmail(email, verificationToken);
      } catch (error) {
        console.error('Failed to send verification email:', error);
        // Continue with registration - user can resend verification later
      }

      const user: AuthUser = {
        id: newUser.id,
        email: newUser.email,
        emailVerified: newUser.emailVerified,
      };

      const token = this.generateToken(user);

      return { user, token };
    } catch (error) {
      console.error('Error during user registration:', error);
      throw error;
    }
  },

  /**
   * Login with email/password
   */
  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Verify password
    const isValid = await this.verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    };

    const token = this.generateToken(authUser);

    return { user: authUser, token };
  },

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    const [tokenRecord] = await db
      .select()
      .from(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.token, token), eq(emailVerificationTokens.used, false)))
      .limit(1);

    if (!tokenRecord) {
      throw new ValidationError('Invalid or expired verification token');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new ValidationError('Verification token has expired');
    }

    // Mark token as used
    await db
      .update(emailVerificationTokens)
      .set({ used: true })
      .where(eq(emailVerificationTokens.id, tokenRecord.id));

    // Update user's email verified status
    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, tokenRecord.userId));
  },

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string, _requestId?: string) {
    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Don't reveal if user exists or not for security
    if (!user) {
      return { message: 'Password reset email sent if account exists' };
    }

    // Generate a random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token valid for 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt,
      used: false,
    });

    // Send email with reset link
    await emailClient.sendPasswordResetEmail(email, token, _requestId);

    return { message: 'Password reset email sent if account exists' };
  },

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string) {
    // Find the token
    const [tokenRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.used, false)))
      .limit(1);

    if (!tokenRecord) {
      throw new ValidationError('Invalid or expired token');
    }

    // Check if token is expired
    if (tokenRecord.expiresAt < new Date()) {
      throw new ValidationError('Token has expired');
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update user's password
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, tokenRecord.userId));

    // Mark token as used
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, tokenRecord.id));

    return { success: true };
  },

  /**
   * OAuth token exchange for Google
   */
  async googleOAuthCallback(code: string): Promise<{ user: AuthUser; token: string }> {
    // Exchange code for access token with Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${process.env.API_URL || 'http://localhost:5000'}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new AuthenticationError('Failed to exchange Google OAuth code');
    }

    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    const accessToken = tokenData.access_token as string;

    if (!accessToken) {
      throw new AuthenticationError('No access token received from Google');
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      throw new AuthenticationError('Failed to get user info from Google');
    }

    const userInfo = await userInfoResponse.json() as Record<string, unknown>;
    const email = userInfo.email as string;
    const oauthId = userInfo.id as string;

    if (!email || !oauthId) {
      throw new AuthenticationError('Invalid user info received from Google');
    }

    // Find or create user in database
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Create new user
      [user] = await db
        .insert(users)
        .values({
          email,
          oauthProvider: 'google',
          oauthId,
          emailVerified: true, // OAuth emails are pre-verified
        })
        .returning();
    } else if (user.oauthProvider !== 'google') {
      // Update existing email/password user to link Google
      await db
        .update(users)
        .set({
          oauthProvider: 'google',
          oauthId,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      emailVerified: true,
    };

    const jwtToken = this.generateToken(authUser);

    return { user: authUser, token: jwtToken };
  },

  /**
   * OAuth token exchange for GitHub
   */
  async githubOAuthCallback(code: string): Promise<{ user: AuthUser; token: string }> {
    // Exchange code for access token with GitHub
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID || '',
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
        code,
        redirect_uri: `${process.env.API_URL || 'http://localhost:5000'}/api/auth/github/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new AuthenticationError('Failed to exchange GitHub OAuth code');
    }

    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    const accessToken = tokenData.access_token as string;

    if (!accessToken) {
      throw new AuthenticationError('No access token received from GitHub');
    }

    // Get user info from GitHub
    const userInfoResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userInfoResponse.ok) {
      throw new AuthenticationError('Failed to get user info from GitHub');
    }

    const userInfo = await userInfoResponse.json() as Record<string, unknown>;
    const oauthId = String(userInfo.id);

    if (!oauthId || oauthId === 'undefined') {
      throw new AuthenticationError('Invalid user info received from GitHub');
    }

    // Get primary email from GitHub
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!emailsResponse.ok) {
      throw new AuthenticationError('Failed to get email from GitHub');
    }

    const emails = await emailsResponse.json() as Array<Record<string, unknown>>;
    const primaryEmail = emails.find((e) => e.primary === true && e.verified === true);

    if (!primaryEmail || !primaryEmail.email) {
      throw new AuthenticationError('No verified primary email found in GitHub account');
    }

    const email = primaryEmail.email as string;

    // Find or create user in database
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Create new user
      [user] = await db
        .insert(users)
        .values({
          email,
          oauthProvider: 'github',
          oauthId,
          emailVerified: true, // OAuth emails are pre-verified
        })
        .returning();
    } else if (user.oauthProvider !== 'github') {
      // Update existing email/password user to link GitHub
      await db
        .update(users)
        .set({
          oauthProvider: 'github',
          oauthId,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      emailVerified: true,
    };

    const jwtToken = this.generateToken(authUser);

    return { user: authUser, token: jwtToken };
  },
  /**
   * Exchange an OAuth access token for an app JWT
   * Used when the frontend (NextAuth) handles the OAuth flow
   */
  async exchangeOAuthToken(provider: 'google' | 'github' | 'yahoo' | 'microsoft', accessToken: string): Promise<{ user: AuthUser; token: string }> {
    let email: string;
    let oauthId: string;

    if (provider === 'google') {
      // Verify Google token and get user info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoResponse.ok) {
        throw new AuthenticationError('Failed to verify Google access token');
      }

      const userInfo = await userInfoResponse.json() as Record<string, unknown>;
      email = userInfo.email as string;
      oauthId = userInfo.id as string;
    } else if (provider === 'github') {
      // Verify GitHub token and get user info
      const userInfoResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userInfoResponse.ok) {
        throw new AuthenticationError('Failed to verify GitHub access token');
      }

      const userInfo = await userInfoResponse.json() as Record<string, unknown>;
      oauthId = String(userInfo.id);

      // Get primary email
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!emailsResponse.ok) {
        throw new AuthenticationError('Failed to get email from GitHub');
      }

      const emails = await emailsResponse.json() as Array<Record<string, unknown>>;
      const primaryEmail = emails.find((e) => e.primary === true && e.verified === true);

      if (!primaryEmail || !primaryEmail.email) {
        throw new AuthenticationError('No verified primary email found in GitHub account');
      }

      email = primaryEmail.email as string;
    } else if (provider === 'yahoo') {
      const userInfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoResponse.ok) {
        throw new AuthenticationError('Failed to verify Yahoo access token');
      }

      const userInfo = await userInfoResponse.json() as Record<string, unknown>;
      email = userInfo.email as string;
      oauthId = userInfo.sub as string;
    } else if (provider === 'microsoft') {
      const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoResponse.ok) {
        throw new AuthenticationError('Failed to verify Microsoft access token');
      }

      const userInfo = await userInfoResponse.json() as Record<string, unknown>;
      email = (userInfo.mail || userInfo.userPrincipalName) as string;
      oauthId = userInfo.id as string;
    } else {
      throw new ValidationError('Unsupported provider');
    }

    if (!email || !oauthId) {
      throw new AuthenticationError(`Invalid user info received from ${provider}`);
    }

    return this.handleOAuthUser(email, provider, oauthId);
  },

  /**
   * OAuth token exchange for Yahoo
   */
  async yahooOAuthCallback(code: string): Promise<{ user: AuthUser; token: string }> {
    const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.API_URL || 'http://localhost:5000'}/api/auth/yahoo/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new AuthenticationError(`Failed to exchange Yahoo OAuth code: ${errText}`);
    }

    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    const accessToken = tokenData.access_token as string;

    if (!accessToken) {
      throw new AuthenticationError('No access token received from Yahoo');
    }

    const userInfoResponse = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      throw new AuthenticationError('Failed to get user info from Yahoo');
    }

    const userInfo = await userInfoResponse.json() as Record<string, unknown>;
    const email = userInfo.email as string;
    const oauthId = userInfo.sub as string;

    if (!email || !oauthId) {
      throw new AuthenticationError('Invalid user info received from Yahoo');
    }

    return this.handleOAuthUser(email, 'yahoo', oauthId);
  },

  /**
   * OAuth token exchange for Microsoft (Outlook)
   */
  async microsoftOAuthCallback(code: string): Promise<{ user: AuthUser; token: string }> {
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || '',
        scope: 'user.read mail.read',
        code,
        redirect_uri: `${process.env.API_URL || 'http://localhost:5000'}/api/auth/microsoft/callback`,
        grant_type: 'authorization_code',
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new AuthenticationError(`Failed to exchange Microsoft OAuth code: ${errText}`);
    }

    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    const accessToken = tokenData.access_token as string;

    if (!accessToken) {
      throw new AuthenticationError('No access token received from Microsoft');
    }

    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      throw new AuthenticationError('Failed to get user info from Microsoft');
    }

    const userInfo = await userInfoResponse.json() as Record<string, unknown>;
    const email = (userInfo.mail || userInfo.userPrincipalName) as string;
    const oauthId = userInfo.id as string;

    if (!email || !oauthId) {
      throw new AuthenticationError('Invalid user info received from Microsoft');
    }

    return this.handleOAuthUser(email, 'microsoft', oauthId);
  },

  /**
   * Helper to handle finding/creating user from OAuth info
   */
  async handleOAuthUser(email: string, provider: 'google' | 'github' | 'yahoo' | 'microsoft', oauthId: string): Promise<{ user: AuthUser; token: string }> {
    // Find or create user in database
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Create new user
      [user] = await db
        .insert(users)
        .values({
          email,
          oauthProvider: provider,
          oauthId,
          emailVerified: true,
        })
        .returning();
    } else if (user.oauthProvider !== provider) {
      // Update existing user to link provider
      await db
        .update(users)
        .set({
          oauthProvider: provider,
          oauthId,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      emailVerified: true,
    };

    const token = this.generateToken(authUser);
    return { user: authUser, token };
  },
};
