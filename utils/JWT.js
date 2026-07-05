// utils/jwt.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';

function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      roles: user.roles,                // array, e.g. ['customer']
      permissions: user.permissions,    // optional array
    },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
}

function verifyAccessToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function verifyRefreshToken(token) {
  try { return jwt.verify(token, REFRESH_SECRET); } catch { return null; }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
