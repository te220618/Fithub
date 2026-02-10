import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';

// Inline styles matching the original login.html
const styles = {
  body: {
    margin: 0,
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: "'Segoe UI', 'Hiragino Kaku Gothic ProN', 'メイリオ', system-ui, -apple-system, sans-serif",
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
  } as React.CSSProperties,
  loginContainer: {
    maxWidth: '400px',
    width: '100%',
  } as React.CSSProperties,
  loginCard: {
    background: 'var(--card)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '40px',
    textAlign: 'center' as const,
    border: '1px solid var(--border)',
  } as React.CSSProperties,
  logo: {
    fontSize: '36px',
    fontWeight: 800,
    position: 'relative' as const,
    marginBottom: '8px',
    background: 'linear-gradient(90deg, #FFE55C, #FFD700, #FFE55C)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    animation: 'glowPulse 3s ease-in-out infinite',
  } as React.CSSProperties,
  welcome: {
    fontSize: '26px',
    fontWeight: 700,
    marginBottom: '8px',
  } as React.CSSProperties,
  subtitle: {
    color: 'var(--muted)',
    fontSize: '14px',
    marginBottom: '32px',
  } as React.CSSProperties,
  formGroup: {
    marginBottom: '20px',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 500,
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '12px 16px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: '8px',
    fontSize: '14px',
    background: '#121212',
    color: 'var(--text)',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  passwordField: {
    position: 'relative' as const,
  } as React.CSSProperties,
  toggleVisibility: {
    position: 'absolute' as const,
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '14px',
  } as React.CSSProperties,
  infoMessage: {
    color: 'var(--gold)',
    fontSize: '13px',
    marginTop: '8px',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  errorMessage: {
    color: '#ef4444',
    fontSize: '13px',
    marginTop: '8px',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  btnLogin: {
    width: '100%',
    padding: '14px',
    background: 'var(--gold)',
    color: 'var(--bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--gold)',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  divider: {
    margin: '24px 0',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'var(--border)',
  } as React.CSSProperties,
  dividerText: {
    padding: '0 16px',
    color: 'var(--muted)',
    fontSize: '13px',
  } as React.CSSProperties,
  socialButtons: {
    display: 'grid',
    gap: '12px',
    marginTop: '16px',
  } as React.CSSProperties,
  socialBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#666666',
    background: '#121212',
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s, border-color 0.2s',
    textDecoration: 'none',
  } as React.CSSProperties,
  socialIcon: {
    width: '20px',
    height: '20px',
  } as React.CSSProperties,
  registerLink: {
    color: 'var(--gold)',
    textDecoration: 'none',
    fontSize: '14px',
    display: 'inline-block',
    marginTop: '24px',
  } as React.CSSProperties,
};

// CSS for glowPulse animation (injected into head)
const glowPulseCSS = `
@keyframes glowPulse {
  0% {
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.2);
  }
  50% {
    text-shadow: 0 0 20px rgba(255, 229, 92, 0.9), 0 0 40px rgba(255, 215, 0, 0.7), 0 0 60px rgba(255, 200, 0, 0.5);
  }
  100% {
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.6), 0 0 20px rgba(255, 215, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.2);
  }
}
`;

export default function Login() {
  const navigate = useNavigate();
  const { fetchUser } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(username, password);
      await fetchUser();
      navigate('/dashboard');
    } catch {
      setError('ログインIDまたはパスワードが正しくありません');
    } finally {
      setIsLoading(false);
    }
  };

  // Get input style with focus state
  const getInputStyle = (name: string): React.CSSProperties => ({
    ...styles.input,
    borderColor: focusedInput === name ? 'var(--gold)' : 'var(--border)',
    outline: 'none',
  });

  // Get button style with hover state
  const getLoginBtnStyle = (): React.CSSProperties => ({
    ...styles.btnLogin,
    ...(hoveredBtn === 'login' ? {
      background: 'var(--gold-light)',
      borderColor: 'var(--gold-light)',
      boxShadow: '0 8px 20px rgba(255, 215, 0, 0.35)',
      transform: 'translateY(-2px)',
    } : {}),
    ...(isLoading ? { opacity: 0.7, cursor: 'not-allowed' } : {}),
  });

  // Get social button style with hover state
  const getSocialBtnStyle = (name: string): React.CSSProperties => ({
    ...styles.socialBtn,
    ...(hoveredBtn === name ? {
      background: '#1e1e1e',
      borderColor: 'var(--gold)',
    } : {}),
  });

  return (
    <>
      {/* Inject glowPulse keyframes */}
      <style>{glowPulseCSS}</style>
      
      <div style={styles.body}>
        <div style={styles.loginContainer}>
          <div style={styles.loginCard}>
            {/* Logo */}
            <div style={styles.logo}>Fithub</div>
            <p style={styles.welcome}>おかえりなさい！</p>
            <p style={styles.subtitle}>セッションを再開して記録を続けましょう</p>

            {/* Login Form */}
            <form onSubmit={handleSubmit} noValidate>
              {/* Username */}
              <div style={styles.formGroup}>
                <label htmlFor="username" style={styles.label}>ユーザーID</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  pattern="^[a-zA-Z0-9]{6,}$"
                  minLength={6}
                  required
                  autoComplete="username"
                  placeholder="英数字6文字以上"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onFocus={() => setFocusedInput('username')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('username')}
                />
                <div style={styles.infoMessage}>※ 英数字6文字以上で入力してください</div>
              </div>

              {/* Password */}
              <div style={styles.formGroup}>
                <label htmlFor="password" style={styles.label}>パスワード</label>
                <div style={styles.passwordField}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    minLength={6}
                    required
                    autoComplete="current-password"
                    placeholder="英数字6文字以上"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput('password')}
                    onBlur={() => setFocusedInput(null)}
                    style={getInputStyle('password')}
                  />
                  <button
                    type="button"
                    style={styles.toggleVisibility}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    👁
                  </button>
                </div>
                <div style={styles.infoMessage}>※ 英数字6文字以上で入力してください</div>
              </div>

              {/* Error Message */}
              {error ? <div style={styles.errorMessage}>{error}</div> : null}

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                style={getLoginBtnStyle()}
                onMouseEnter={() => setHoveredBtn('login')}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                {isLoading ? '処理中...' : 'ログイン'}
              </button>
            </form>

            {/* Divider */}
            <div style={styles.divider}>
              <div style={styles.dividerLine} />
              <span style={styles.dividerText}>または</span>
              <div style={styles.dividerLine} />
            </div>

            {/* Social Buttons */}
            <div style={styles.socialButtons}>
              <a
                href="/oauth2/authorization/google"
                style={getSocialBtnStyle('google')}
                onMouseEnter={() => setHoveredBtn('google')}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                <img src="/images/google/googleicon.png" alt="Google" style={styles.socialIcon} />
                Googleでログイン
              </a>
              <a
                href="/oauth2/authorization/microsoft"
                style={getSocialBtnStyle('microsoft')}
                onMouseEnter={() => setHoveredBtn('microsoft')}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                <img src="/images/Microsoft/microsoft.png" alt="Microsoft" style={styles.socialIcon} />
                Microsoftでログイン
              </a>
              <a
                href="/oauth2/authorization/github"
                style={getSocialBtnStyle('github')}
                onMouseEnter={() => setHoveredBtn('github')}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                GitHubでログイン
              </a>
            </div>

            {/* Register Link */}
            <Link
              to="/register"
              style={{
                ...styles.registerLink,
                ...(hoveredBtn === 'register' ? { textDecoration: 'underline' } : {}),
              }}
              onMouseEnter={() => setHoveredBtn('register')}
              onMouseLeave={() => setHoveredBtn(null)}
            >
              アカウントをお持ちでない方はこちら
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
