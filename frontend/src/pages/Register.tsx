import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../services/authApi';

// Inline styles matching the original register.html
const styles = {
  body: {
    margin: 0,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    fontFamily: "'Segoe UI', 'Hiragino Kaku Gothic ProN', 'メイリオ', system-ui, -apple-system, sans-serif",
    padding: '16px',
    color: 'var(--text)',
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: '460px',
    background: 'var(--card)',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
    border: '1px solid var(--border)',
  } as React.CSSProperties,
  title: {
    fontSize: '32px',
    fontWeight: 800,
    margin: '0 0 8px',
  } as React.CSSProperties,
  subtitle: {
    color: 'var(--muted)',
    marginBottom: '32px',
  } as React.CSSProperties,
  formGroup: {
    marginBottom: '24px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 600,
  } as React.CSSProperties,
  inputWrapper: {
    position: 'relative' as const,
    width: '100%',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '14px 16px',
    paddingRight: '48px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: '#121212',
    color: 'var(--text)',
    fontSize: '16px',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
  } as React.CSSProperties,
  passwordToggle: {
    position: 'absolute' as const,
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  helper: {
    fontSize: '12px',
    color: 'var(--muted)',
    marginTop: '6px',
  } as React.CSSProperties,
  errorMessage: {
    fontSize: '13px',
    color: '#ef4444',
    marginTop: '6px',
  } as React.CSSProperties,
  btnPrimary: {
    width: '100%',
    padding: '16px',
    borderRadius: '12px',
    border: 'none',
    background: 'var(--gold)',
    color: '#111',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  link: {
    display: 'block',
    textAlign: 'center' as const,
    marginTop: '16px',
    color: 'var(--gold)',
    textDecoration: 'none',
  } as React.CSSProperties,
};

// Eye icon SVG (visible state)
const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

// Eye-off icon SVG (hidden state)
const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

export default function Register() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }

    setIsLoading(true);

    try {
      await register(loginId, password, confirmPassword);
      // セッションに一時保存されたので/profileに遷移（まだユーザーは作成されていない）
      navigate('/profile');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      if (error.response?.data?.error) {
        setError(error.response.data.error);
      } else if (error.response?.data?.message) {
        setError(error.response.data.message);
      } else {
        setError('登録に失敗しました。別のログインIDをお試しください');
      }
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
  const getBtnStyle = (): React.CSSProperties => ({
    ...styles.btnPrimary,
    ...(hoveredBtn === 'submit' ? {
      background: 'var(--gold-light)',
    } : {}),
    ...(isLoading ? { opacity: 0.7, cursor: 'not-allowed' } : {}),
  });

  // Get toggle button style with hover state
  const getToggleStyle = (name: string): React.CSSProperties => ({
    ...styles.passwordToggle,
    color: hoveredBtn === name ? 'var(--text)' : 'var(--muted)',
  });

  return (
    <div style={styles.body}>
      <div style={styles.card}>
        <p style={styles.title}>ようこそ</p>
        <p style={styles.subtitle}>まずはログインに使うユーザーIDとパスワードを登録します。</p>

        <form onSubmit={handleSubmit} noValidate>
          {/* User ID */}
          <div style={styles.formGroup}>
            <label htmlFor="loginId" style={styles.label}>ユーザーID</label>
            <input
              id="loginId"
              name="loginId"
              type="text"
              pattern="^[a-zA-Z0-9]{6,}$"
              minLength={6}
              required
              placeholder="英数字6文字以上"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              onFocus={() => setFocusedInput('loginId')}
              onBlur={() => setFocusedInput(null)}
              style={getInputStyle('loginId')}
            />
            <div style={styles.helper}>6文字以上の英数字。ログイン時に使用します。</div>
          </div>

          {/* Password */}
          <div style={styles.formGroup}>
            <label htmlFor="password" style={styles.label}>パスワード</label>
            <div style={styles.inputWrapper}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                minLength={6}
                required
                placeholder="英数字6文字以上"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
                style={getInputStyle('password')}
              />
              <button
                type="button"
                style={getToggleStyle('passwordToggle')}
                onClick={() => setShowPassword(!showPassword)}
                onMouseEnter={() => setHoveredBtn('passwordToggle')}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div style={styles.helper}>英数字6文字以上。大文字小文字を区別します。</div>
          </div>

          {/* Confirm Password */}
          <div style={styles.formGroup}>
            <label htmlFor="confirmPassword" style={styles.label}>パスワード（確認）</label>
            <div style={styles.inputWrapper}>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                minLength={6}
                required
                placeholder="もう一度入力してください"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={() => setFocusedInput('confirmPassword')}
                onBlur={() => setFocusedInput(null)}
                style={getInputStyle('confirmPassword')}
              />
              <button
                type="button"
                style={getToggleStyle('confirmPasswordToggle')}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                onMouseEnter={() => setHoveredBtn('confirmPasswordToggle')}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error ? <div style={styles.errorMessage}>{error}</div> : null}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={getBtnStyle()}
            onMouseEnter={() => setHoveredBtn('submit')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            {isLoading ? '処理中...' : '次へ（プロフィール登録）'}
          </button>
        </form>

        {/* Login Link */}
        <Link
          to="/login"
          style={{
            ...styles.link,
            ...(hoveredBtn === 'login' ? { textDecoration: 'underline' } : {}),
          }}
          onMouseEnter={() => setHoveredBtn('login')}
          onMouseLeave={() => setHoveredBtn(null)}
        >
          既にアカウントをお持ちの方はこちら
        </Link>
      </div>
    </div>
  );
}
