import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserInfo, updateDisplayName, updatePassword, deleteAccount, logout } from '../../services/authApi';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useWindowEventListener } from '../../hooks';

type TabType = 'display-name' | 'password' | 'delete-account';

export default function UserSettingsModal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeModal, closeModal, showToast } = useUIStore();
  const { clearUser } = useAuthStore();
  const isOpen = activeModal === 'user-settings';

  const [activeTab, setActiveTab] = useState<TabType>('display-name');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // ユーザー情報取得
  const { data: userInfo } = useQuery({
    queryKey: ['userInfo'],
    queryFn: getUserInfo,
    enabled: isOpen,
  });



  // モーダルが開いた時に初期化
  useEffect(() => {
    if (isOpen && userInfo) {
      setNewDisplayName(userInfo.displayName || '');
      // OAuthユーザーの場合は削除タブを初期表示
      if (userInfo.isOAuthUser) {
        setActiveTab('delete-account');
      } else {
        setActiveTab('display-name');
      }
    }
  }, [isOpen, userInfo]);



  // ESCキーで閉じる
  useWindowEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') closeModal();
    },
    { enabled: isOpen }
  );

  // 表示名更新
  const updateNameMutation = useMutation({
    mutationFn: () => updateDisplayName({ displayName: newDisplayName.trim() }),
    onSuccess: () => {
      showToast('ユーザー名を変更しました', 'success');
      queryClient.invalidateQueries({ queryKey: ['userInfo'] });
      closeModal();
    },
    onError: (error: Error) => {
      showToast(error.message || 'ユーザー名の変更に失敗しました', 'error');
    },
  });

  // パスワード更新
  const updatePasswordMutation = useMutation({
    mutationFn: () =>
      updatePassword({
        currentPassword,
        newPassword,
        confirmPassword: confirmNewPassword,
      }),
    onSuccess: () => {
      showToast('パスワードを変更しました', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      closeModal();
    },
    onError: (error: Error) => {
      showToast(error.message || 'パスワードの変更に失敗しました', 'error');
    },
  });

  // アカウント削除
  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      showToast('アカウントを削除しました', 'success');
      window.location.href = '/login';
    },
    onError: (error: Error) => {
      showToast(error.message || 'アカウントの削除に失敗しました', 'error');
    },
  });

  const handleUpdateDisplayName = () => {
    if (!newDisplayName.trim()) {
      showToast('ユーザー名を入力してください', 'error');
      return;
    }
    updateNameMutation.mutate();
  };

  const handleUpdatePassword = () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      showToast('すべてのフィールドを入力してください', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast('新しいパスワードが一致しません', 'error');
      return;
    }
    if (newPassword.length < 6 || !/^[A-Za-z0-9]+$/.test(newPassword)) {
      showToast('パスワードは半角英数字6文字以上で入力してください', 'error');
      return;
    }
    updatePasswordMutation.mutate();
  };

  const handleDeleteAccount = () => {
    if (!confirm('本当にアカウントを削除しますか？\nこの操作は取り消せません。')) {
      return;
    }
    if (!confirm('最終確認：すべてのデータが削除されます。本当によろしいですか？')) {
      return;
    }
    deleteAccountMutation.mutate();
  };

  const handleLogout = async () => {
    try {
      await logout();
      clearUser();
      closeModal();
      navigate('/login');
    } catch {
      clearUser();
      closeModal();
      navigate('/login');
    }
  };

  if (!isOpen) return null;

  const isOAuthUser = userInfo?.isOAuthUser ?? false;

  return (
    <div
      className="user-settings-modal-overlay active"
      onClick={(e) => e.target === e.currentTarget && closeModal()}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        className="user-settings-modal"
        style={{
          background: 'var(--card)',
          borderRadius: '16px',
          width: 'min(90%, 420px)',
          maxHeight: '90vh',
          overflow: 'hidden',
          border: '1px solid var(--border-gold)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>
            ユーザー設定
          </h3>
          <button
            onClick={closeModal}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '24px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginBottom: '20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {!isOAuthUser ? (
              <>
                <button
                  onClick={() => setActiveTab('display-name')}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    background: 'transparent',
                    border: 'none',
                    color: activeTab === 'display-name' ? 'var(--gold)' : 'var(--muted)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderBottom: activeTab === 'display-name' ? '2px solid var(--gold)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  ユーザー名変更
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    background: 'transparent',
                    border: 'none',
                    color: activeTab === 'password' ? 'var(--gold)' : 'var(--muted)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    borderBottom: activeTab === 'password' ? '2px solid var(--gold)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  パスワード変更
                </button>
              </>
            ) : null}

            <button
              onClick={() => setActiveTab('delete-account')}
              style={{
                flex: 1,
                padding: '12px 8px',
                background: 'transparent',
                border: 'none',
                color: activeTab === 'delete-account' ? 'var(--gold)' : 'var(--muted)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                borderBottom: activeTab === 'delete-account' ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              アカウント削除
            </button>
          </div>

          {/* Tab Content: Display Name */}
          {activeTab === 'display-name' && !isOAuthUser ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: '8px',
                  }}
                >
                  新しいユーザー名
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="20文字以内"
                  maxLength={20}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: '#1a1a1a',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'var(--text)',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={handleUpdateDisplayName}
                disabled={updateNameMutation.isPending}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                変更を保存
              </button>
            </div>
          ) : null}

          {/* Tab Content: Password */}
          {activeTab === 'password' && !isOAuthUser ? (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: '8px',
                  }}
                >
                  現在のパスワード
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="現在のパスワード"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: '#1a1a1a',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'var(--text)',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: '8px',
                  }}
                >
                  新しいパスワード
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="半角英数字6文字以上"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: '#1a1a1a',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'var(--text)',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: '8px',
                  }}
                >
                  新しいパスワード（確認）
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="新しいパスワードを再入力"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: '#1a1a1a',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'var(--text)',
                    fontSize: '15px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                onClick={handleUpdatePassword}
                disabled={updatePasswordMutation.isPending}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                  color: 'var(--bg)',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                パスワードを変更
              </button>
            </div>
          ) : null}



          {/* Tab Content: Delete Account */}
          {activeTab === 'delete-account' ? (
            <div>
              <div
                style={{
                  padding: '16px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  borderRadius: '10px',
                  marginBottom: '20px',
                }}
              >
                <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#f87171' }}>
                  ⚠️ この操作は取り消せません
                </p>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted)' }}>
                  アカウントを削除すると、すべてのトレーニング記録やカスタム種目が完全に削除されます。
                </p>
              </div>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteAccountMutation.isPending}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'transparent',
                  color: '#dc2626',
                  border: '1px solid #dc2626',
                  borderRadius: '10px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                アカウントを削除する
              </button>
            </div>
          ) : null}

          {/* Logout Section */}
          <div
            style={{
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '14px',
                background: 'transparent',
                color: '#ff4d4d',
                border: '1px solid #ff4d4d',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <img
                src="/images/logout/ドアアイコン.webp"
                alt=""
                style={{
                  width: '18px',
                  height: '18px',
                  filter: 'brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(1352%) hue-rotate(329deg) brightness(101%) contrast(101%)',
                }}
              />
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
