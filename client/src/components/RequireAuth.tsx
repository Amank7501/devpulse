import { Navigate, Outlet } from 'react-router-dom';

interface JwtPayload {
  exp?: number;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;

  return payload.exp * 1000 <= Date.now();
}

export default function RequireAuth() {
  const token = localStorage.getItem('devpulse_token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isExpired(token)) {
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
