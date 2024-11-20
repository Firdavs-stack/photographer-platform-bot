const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your_jwt_secret'; // Замените на ваш реальный секретный ключ

const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.userId = decoded.id;
        next();
    });
};

module.exports = authMiddleware;
