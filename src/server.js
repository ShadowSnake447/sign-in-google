import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const clientId = process.env.GOOGLE_CLIENT_ID || '';

const oauthClient = new OAuth2Client(clientId);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Provide frontend with client configuration
app.get('/api/config', (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    isConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id.apps.googleusercontent.com')
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Verify Google ID Token
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        error: 'Missing Google credential token in request body.'
      });
    }

    const targetClientId = process.env.GOOGLE_CLIENT_ID;

    // Verify token with Google's public keys
    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: targetClientId || undefined
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Failed to extract payload from Google token.'
      });
    }

    // Extracted verified user identity from Google
    const user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      givenName: payload.given_name,
      familyName: payload.family_name,
      picture: payload.picture,
      emailVerified: payload.email_verified,
      hostedDomain: payload.hd || null
    };

    // Note: In production, create or look up the user in your database,
    // establish a session (e.g. cookie / session ID or custom app JWT).

    return res.status(200).json({
      success: true,
      message: 'Google authentication successful',
      user
    });
  } catch (err) {
    console.error('Error verifying Google ID token:', err.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid Google token or verification failed',
      details: err.message
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  if (!clientId || clientId === 'your-google-client-id.apps.googleusercontent.com') {
    console.warn('\x1b[33m%s\x1b[0m', 'Warning: GOOGLE_CLIENT_ID is not configured in .env. Configure it to enable token verification.');
  } else {
    console.log(`Configured Google Client ID: ${clientId.substring(0, 12)}...`);
  }
});
