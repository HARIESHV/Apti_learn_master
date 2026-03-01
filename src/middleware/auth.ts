import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'aptilearn_secret_key_2024';

export interface AuthRequest extends Request {
    user?: {
        id: number;
        username: string;
        role: string;
        full_name: string;
    };
}

export function generateToken(user: { id: number; username: string; role: string; full_name: string }): string {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.warn('[AuthMiddleware] No token provided');
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = { id: decoded.id, username: decoded.username, role: decoded.role, full_name: decoded.full_name };
        next();
    } catch (err: any) {
        res.status(403).json({ error: 'Invalid or expired token', details: err.message });
    }
}

export function requireRole(role: string) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user || req.user.role !== role) {
            res.status(403).json({ error: `Access denied. ${role} role required.` });
            return;
        }
        next();
    };
}

export { JWT_SECRET };
