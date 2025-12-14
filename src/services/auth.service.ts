import { db } from '../lib/db';
import { passwordResetTokens, users, emailVerificationTokens } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { ValidationError, AuthenticationError } from '../lib/errors';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

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

    // TODO: Send verification email
    // await emailClient.sendVerificationEmail(email, verificationToken);

    const user: AuthUser = {
      id: newUser.id,
      email: newUser.email,
      emailVerified: newUser.emailVerified,
    };

    const token = this.generateToken(user);

    return { user, token };
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

    // TODO: Send email with reset link
    // await emailClient.sendPasswordResetEmail(email, token, requestId);

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
  async googleOAuthCallback(_code: string): Promise<{ user: AuthUser; token: string }> {
    // TODO: Implement Google OAuth token exchange
    // 1. Exchange code for access token with Google
    // 2. Get user info from Google
    // 3. Create or find user in database
    // 4. Generate JWT token
    throw new Error('Google OAuth not yet implemented');
  },

  /**
   * OAuth token exchange for GitHub
   */
  async githubOAuthCallback(_code: string): Promise<{ user: AuthUser; token: string }> {
    // TODO: Implement GitHub OAuth token exchange
    // 1. Exchange code for access token with GitHub
    // 2. Get user info from GitHub
    // 3. Create or find user in database
    // 4. Generate JWT token
    throw new Error('GitHub OAuth not yet implemented');
  },
};
