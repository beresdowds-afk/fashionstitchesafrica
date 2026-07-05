// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { findUserByEmail, createUser, updateUserProfile } = require('../models/user'); // your DB methods

// ---------- Login ----------
router.post('/login', async (req, res) => {
  const { email, password, appOrigin } = req.body; // appOrigin tells which app is logging in
  try {
    const user = await findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if the user is allowed to access this app (enforce early)
    const allowed = checkAppAccess(user.roles, appOrigin);
    if (!allowed) {
      return res.status(403).json({ error: 'You are not allowed to access this application.' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in DB (for invalidation)
    await storeRefreshToken(user.id, refreshToken);

    // Set cookies (HttpOnly, Secure, SameSite=Lax, Domain)
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: true,          // requires HTTPS
      sameSite: 'lax',
      domain: process.env.COOKIE_DOMAIN, // .fs-africa.org.ng
      maxAge: 15 * 60 * 1000, // 15 min
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      domain: process.env.COOKIE_DOMAIN,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ success: true, user: { id: user.id, email: user.email, roles: user.roles } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- Refresh ----------
router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) return res.status(403).json({ error: 'Invalid refresh token' });

  const user = await findUserById(decoded.userId);
  if (!user) return res.status(403).json({ error: 'User not found' });

  // Optionally check if refresh token is in DB and not revoked

  const newAccessToken = generateAccessToken(user);
  res.cookie('access_token', newAccessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: process.env.COOKIE_DOMAIN,
    maxAge: 15 * 60 * 1000,
  });
  res.json({ success: true });
});

// ---------- Logout ----------
router.post('/logout', (req, res) => {
  res.clearCookie('access_token', { domain: process.env.COOKIE_DOMAIN });
  res.clearCookie('refresh_token', { domain: process.env.COOKIE_DOMAIN });
  res.json({ success: true });
});

// ---------- Password Reset (initiate) ----------
router.post('/password-reset', async (req, res) => {
  const { email } = req.body;
  // Generate reset token, send email, etc.
  res.json({ message: 'Reset link sent' });
});

// ---------- Update Profile (authenticated) ----------
router.put('/profile', authenticate, async (req, res) => {
  const user = req.user; // set by authenticate middleware
  const { name, phone } = req.body;
  await updateUserProfile(user.id, { name, phone });
  res.json({ success: true });
});

// ---------- Helper: check app access ----------
function checkAppAccess(roles, appOrigin) {
  // Map origin to application
  let app;
  if (appOrigin.includes('ifysora.fs-africa.org.ng')) app = 'ifysora';
  else if (appOrigin.includes('fysoracompanion.fs-africa.org.ng')) app = 'companion';
  else if (appOrigin.includes('fs-africa.org.ng')) app = 'fashn';
  else app = 'unknown';

  // Super Admin can access everything
  if (roles.includes('super_admin')) return true;

  // Customer cannot access iFYSORA
  if (app === 'ifysora' && roles.includes('customer')) return false;

  // Tailor/Designer/Organization cannot access Companion
  if (app === 'companion' && (roles.some(r => ['tailor', 'designer', 'organization'].includes(r)))) {
    return false;
  }

  // Everyone can access FYSORA FASHN
  return true;
}

module.exports = router;
