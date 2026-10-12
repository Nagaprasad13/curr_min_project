const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { signToken } = require('../config/jwt');
const { authenticate } = require('../middleware/auth');
const { recordAuditLog } = require('../services/auditService');

/**
 * POST /api/auth/login
 * Public authentication endpoint.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Bad Request', message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    }

    const token = signToken({
      id: user._id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
    });

    await recordAuditLog({
      actorId: user._id,
      actorRole: user.role,
      action: 'SYSTEM_AUDIT',
      resourceType: 'User',
      resourceId: user._id.toString(),
      accessGranted: true,
      justification: 'User successfully logged in via credentials',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        district: user.district,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * POST /api/auth/register
 * Demo user registration endpoint.
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, hospitalId, district } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Bad Request', message: 'Name, email, password, and role are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'A user with this email address already exists.' });
    }

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role,
      hospitalId,
      district,
      isSynthetic: true,
    });

    await user.save();

    const token = signToken({
      id: user._id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
    });

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

/**
 * GET /api/auth/me
 * Protected endpoint returning profile of current authenticated user.
 */
router.get('/me', authenticate, async (req, res) => {
  return res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      hospitalId: req.user.hospitalId,
      district: req.user.district,
    },
  });
});

module.exports = router;
