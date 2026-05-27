import dotenv from 'dotenv';
dotenv.config();

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  database: {
    url: process.env.DATABASE_URL!,
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
      .split(',')
      .map((o) => o.trim()),
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3Bucket: process.env.AWS_S3_BUCKET || 's3-wedding-app',
    // Public bucket URL — no CloudFront needed since bucket is public
    cdnBaseUrl: process.env.AWS_CDN_BASE_URL || 'https://s3-wedding-app.s3.us-east-1.amazonaws.com',
    // Backend media proxy base URL — used to serve images if S3 is private
    mediaProxyBaseUrl: process.env.MEDIA_PROXY_BASE_URL || 'http://localhost:4000',
    presignedUrlExpires: parseInt(process.env.S3_PRESIGNED_URL_EXPIRES || '900', 10),
  },

  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin123!',
  },

  guestInviteBaseUrl: process.env.GUEST_INVITE_BASE_URL || 'http://localhost:3001',
};
