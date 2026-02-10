import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveProfile, cancelRegistration, checkRegistrationStatus } from '../services/authApi';
import { useAuthStore } from '../stores/authStore';
import { useWindowEventListener } from '../hooks';

// Inline styles matching the original profile.html
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
    maxWidth: '600px',
    background: 'var(--card)',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
    border: '1px solid var(--border)',
  } as React.CSSProperties,
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '12px',
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
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '8px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: '#121212',
    color: 'var(--text)',
    fontSize: '16px',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: '#121212',
    color: 'var(--text)',
    fontSize: '16px',
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
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
    marginBottom: '16px',
    whiteSpace: 'pre-wrap',
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
  btnSecondary: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: '14px',
    marginTop: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as React.CSSProperties,
  birthdayFields: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  } as React.CSSProperties,
  fieldWrapper: {
    flex: 1,
  } as React.CSSProperties,
  fieldLabel: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    color: 'var(--muted)',
    fontWeight: 'normal' as const,
  } as React.CSSProperties,
  // Gender segment buttons
  genderGroup: {
    display: 'flex',
    gap: '0',
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
  } as React.CSSProperties,
  genderButton: {
    flex: 1,
    padding: '14px 16px',
    background: '#121212',
    color: 'var(--text)',
    border: 'none',
    borderRight: '1px solid var(--border)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  genderButtonActive: {
    background: 'var(--gold)',
    color: '#111',
    fontWeight: 600,
  } as React.CSSProperties,
};

const genderOptions = [
  { value: 'MALE', label: '男性' },
  { value: 'FEMALE', label: '女性' },
  { value: 'OTHER', label: 'その他' },
];

const months = [
  { value: '', label: '月' },
  { value: '1', label: '1月' },
  { value: '2', label: '2月' },
  { value: '3', label: '3月' },
  { value: '4', label: '4月' },
  { value: '5', label: '5月' },
  { value: '6', label: '6月' },
  { value: '7', label: '7月' },
  { value: '8', label: '8月' },
  { value: '9', label: '9月' },
  { value: '10', label: '10月' },
  { value: '11', label: '11月' },
  { value: '12', label: '12月' },
];

export default function Profile() {
  const navigate = useNavigate();
  const { fetchUser } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // Check if user has pending registration
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await checkRegistrationStatus();
        if (!status.hasPendingRegistration) {
          // No pending registration, redirect to register
          navigate('/register', { replace: true });
        }
      } catch {
        // Error checking status, redirect to register
        navigate('/register', { replace: true });
      } finally {
        setIsCheckingStatus(false);
      }
    };
    checkStatus();
  }, [navigate]);

  // Prevent accidental navigation away
  useWindowEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });

  useWindowEventListener('popstate', () => {
    if (window.confirm('登録をキャンセルしますか？\nキャンセルするとアカウントは作成されません。')) {
      handleCancel();
    } else {
      // Push state back to prevent navigation
      window.history.pushState(null, '', window.location.href);
    }
  });

  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const newErrors: string[] = [];

    if (!displayName.trim()) {
      newErrors.push('ユーザー名を入力してください');
    } else if (displayName.length > 20) {
      newErrors.push('ユーザー名は20文字以内で入力してください');
    }

    if (!gender) {
      newErrors.push('性別を選択してください');
    }

    if (!birthYear || !birthMonth || !birthDay) {
      newErrors.push('生年月日をすべて入力してください');
    }

    if (newErrors.length > 0) {
      setError(newErrors.join('\n'));
      return;
    }

    setIsLoading(true);

    try {
      // Build birthday string
      let birthday = '';
      if (birthYear && birthMonth && birthDay) {
        const month = birthMonth.padStart(2, '0');
        const day = birthDay.padStart(2, '0');
        birthday = `${birthYear}-${month}-${day}`;
      }

      await saveProfile(displayName, gender, birthday);
      
      // プロフィール保存成功後、ユーザー情報を取得してから遷移
      await fetchUser();
      
      // Remove beforeunload listener before navigation
      window.onbeforeunload = null;
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      if (error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError('プロフィールの保存に失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelRegistration();
      window.onbeforeunload = null;
      navigate('/login');
    } catch {
      setError('キャンセル処理に失敗しました');
    }
  };

  // Get input style with focus state
  const getInputStyle = (name: string): React.CSSProperties => ({
    ...styles.input,
    borderColor: focusedInput === name ? 'var(--gold)' : 'var(--border)',
    outline: 'none',
  });

  // Get select style with focus state
  const getSelectStyle = (name: string): React.CSSProperties => ({
    ...styles.select,
    borderColor: focusedInput === name ? 'var(--gold)' : 'var(--border)',
    outline: 'none',
  });

  // Get primary button style with hover state
  const getPrimaryBtnStyle = (): React.CSSProperties => ({
    ...styles.btnPrimary,
    ...(hoveredBtn === 'submit' ? {
      background: 'var(--gold-light)',
    } : {}),
    ...(isLoading ? { opacity: 0.7, cursor: 'not-allowed' } : {}),
  });

  // Get secondary button style with hover state
  const getSecondaryBtnStyle = (): React.CSSProperties => ({
    ...styles.btnSecondary,
    ...(hoveredBtn === 'cancel' ? {
      background: 'rgba(255, 255, 255, 0.05)',
    } : {}),
  });

  // Get gender button style
  const getGenderButtonStyle = (value: string, index: number): React.CSSProperties => ({
    ...styles.genderButton,
    ...(gender === value ? styles.genderButtonActive : {}),
    ...(index === genderOptions.length - 1 ? { borderRight: 'none' } : {}),
  });

  // Show loading while checking registration status
  if (isCheckingStatus) {
    return (
      <div style={styles.body}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid var(--gold)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <p style={{ color: 'var(--muted)' }}>読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.body}>
      <div style={styles.card}>
        <p style={styles.title}>プロフィールを仕上げましょう</p>
        <p style={styles.subtitle}>ダッシュボードで表示されるユーザー名や基本情報を設定します。</p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Display Name */}
          <div style={styles.formGroup}>
            <label htmlFor="displayName" style={styles.label}>ユーザー名</label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              maxLength={20}
              required
              placeholder="20文字以内"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onFocus={() => setFocusedInput('displayName')}
              onBlur={() => setFocusedInput(null)}
              style={getInputStyle('displayName')}
            />
            <div style={styles.helper}>ダッシュボードや記録画面に表示されます。</div>
          </div>

          {/* Gender - Segment Buttons */}
          <div style={styles.formGroup}>
            <label style={styles.label}>性別</label>
            <div style={styles.genderGroup}>
              {genderOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setGender(option.value)}
                  style={getGenderButtonStyle(option.value, index)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Birthday */}
          <div style={styles.formGroup}>
            <label style={styles.label}>誕生日</label>
            <div style={styles.birthdayFields}>
              <div style={styles.fieldWrapper}>
                <label htmlFor="birthYear" style={styles.fieldLabel}>年</label>
                <input
                  type="number"
                  id="birthYear"
                  name="birthYear"
                  placeholder="1990"
                  min={1900}
                  max={2100}
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  onFocus={() => setFocusedInput('birthYear')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('birthYear')}
                />
              </div>
              <div style={styles.fieldWrapper}>
                <label htmlFor="birthMonth" style={styles.fieldLabel}>月</label>
                <select
                  id="birthMonth"
                  name="birthMonth"
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                  onFocus={() => setFocusedInput('birthMonth')}
                  onBlur={() => setFocusedInput(null)}
                  style={getSelectStyle('birthMonth')}
                >
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.fieldWrapper}>
                <label htmlFor="birthDay" style={styles.fieldLabel}>日</label>
                <input
                  type="number"
                  id="birthDay"
                  name="birthDay"
                  placeholder="1"
                  min={1}
                  max={31}
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  onFocus={() => setFocusedInput('birthDay')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('birthDay')}
                />
              </div>
            </div>
            <div style={styles.helper}>目標設定や分析に活用されます。</div>
          </div>

          {/* Error Message */}
          {error ? <div style={styles.errorMessage}>{error}</div> : null}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={getPrimaryBtnStyle()}
            onMouseEnter={() => setHoveredBtn('submit')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            {isLoading ? '処理中...' : '登録を完了する'}
          </button>

          {/* Cancel Button */}
          <button
            type="button"
            onClick={handleCancel}
            style={getSecondaryBtnStyle()}
            onMouseEnter={() => setHoveredBtn('cancel')}
            onMouseLeave={() => setHoveredBtn(null)}
          >
            戻る
          </button>
        </form>
      </div>
    </div>
  );
}
