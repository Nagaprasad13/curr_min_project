const crypto = require('crypto');

/**
 * Double-submit cookie CSRF Protection Middleware.
 * Only enforced on state-changing requests (POST, PUT, PATCH, DELETE)
 * that authenticate via cookies rather than explicit Authorization Bearer headers.
 */
function csrfProtection(req, res, next) {
  // Safe HTTP methods do not change state
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt public auth endpoints
  const exemptPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/register-invited',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/demo-login',
    '/api/auth/refresh',
    '/api/auth/logout',
  ];

  if (exemptPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  // If the request uses explicit Authorization Bearer token header,
  // ambient browser cookie CSRF is not a vulnerability
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }

  // CSRF protection is required when the browser authenticates via ambient session cookies
  const hasSessionCookie = Boolean(req.cookies && (req.cookies.accessToken || req.cookies.refreshToken));
  if (!hasSessionCookie) {
    // Unauthenticated requests without session cookies proceed to route authentication (returning 401)
    return next();
  }

  // If request uses ambient session cookies, check matching CSRF token
  const cookieToken = req.cookies ? req.cookies['XSRF-TOKEN'] : null;
  const headerToken = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CSRF token validation failed. Missing or invalid XSRF token header.',
    });
  }

  next();
}

/**
 * Generates and sets a non-httpOnly XSRF-TOKEN cookie readable by client JavaScript
 */
function setCsrfCookie(res) {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false, // Must be readable by client JS to attach to request headers
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return token;
}

module.exports = {
  csrfProtection,
  setCsrfCookie,
};
