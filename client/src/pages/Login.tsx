import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import styles from './Login.module.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

function authUrl(): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/api/auth/github`;
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const error = searchParams.get('error');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) return;

    localStorage.setItem('devpulse_token', token);
    navigate('/', { replace: true });
  }, [navigate, searchParams]);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.iconWrapper}>
          <Activity size={32} strokeWidth={2.5} />
        </div>
        <h1 className={styles.heading}>DevPulse</h1>
        <p className={styles.copy}>Sign in to sync and explore your GitHub activity with deep insights.</p>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            window.location.assign(authUrl());
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
          Sign in with GitHub
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}
