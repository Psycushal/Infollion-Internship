const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = 'your_jwt_secret_key'; // Use environment variable in production

exports.authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Access denied' });
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.isDeleted) return res.status(401).json({ message: 'User not found or deleted' });
    
    req.user = {
      userId: user._id,
      email: user.email,
      isAdmin: user.isAdmin
    };
    
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

exports.isAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};