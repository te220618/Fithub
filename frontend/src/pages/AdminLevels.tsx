import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminUsers, updateUserLevel } from '../services/adminApi';
import { useUIStore } from '../stores/uiStore';
import type { AdminUser } from '../types/admin';
import '../styles/admin.css';

/** レベルからEXPを計算（バックエンドと同じ式） */
function calculateExpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 40 * level * level + 100 * level - 140;
}

/** 数値をカンマ区切りでフォーマット */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

export default function AdminLevels() {
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editLevel, setEditLevel] = useState(1);

  // ユーザー一覧取得
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: getAdminUsers,
  });

  // レベル更新Mutation
  const updateMutation = useMutation({
    mutationFn: ({ userId, level }: { userId: number; level: number }) =>
      updateUserLevel(userId, level),
    onSuccess: (response) => {
      showToast(response.message, 'success');
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setEditingUser(null);
    },
    onError: () => {
      showToast('レベルの更新に失敗しました', 'error');
    },
  });

  // 検索フィルタ
  const filteredUsers = users?.filter((user) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.loginId.toLowerCase().includes(query) ||
      user.displayName?.toLowerCase().includes(query) ||
      user.id.toString().includes(query)
    );
  });

  // 編集開始
  const handleEdit = (user: AdminUser) => {
    setEditingUser(user);
    setEditLevel(user.level);
  };

  // 編集キャンセル
  const handleCancel = () => {
    setEditingUser(null);
    setEditLevel(1);
  };

  // 保存
  const handleSave = () => {
    if (!editingUser) return;
    if (editLevel < 1 || editLevel > 1000) {
      showToast('レベルは1〜1000の範囲で指定してください', 'error');
      return;
    }
    updateMutation.mutate({ userId: editingUser.id, level: editLevel });
  };

  // エラー表示
  if (error) {
    return (
      <div className="admin-page">
        <div className="admin-error">
          <h2>アクセス権限がありません</h2>
          <p>この機能は管理者専用です。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>レベル管理</h1>
        <p>ユーザーのレベルと累計EXPを管理します</p>
      </div>

      {/* 検索バー */}
      <div className="admin-search">
        <input
          type="text"
          placeholder="ID、ログインID、表示名で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="admin-search-input"
        />
      </div>

      {/* ユーザー一覧 */}
      <div className="admin-table-container">
        {isLoading ? (
          <div className="admin-loading">読み込み中...</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>ログインID</th>
                <th>表示名</th>
                <th>レベル</th>
                <th>累計EXP</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers?.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.loginId}</td>
                  <td>{user.displayName || '-'}</td>
                  <td>
                    <span className="level-badge">Lv.{user.level}</span>
                  </td>
                  <td>{formatNumber(user.totalExp)}</td>
                  <td>
                    <button
                      className="admin-edit-btn"
                      onClick={() => handleEdit(user)}
                    >
                      編集
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {filteredUsers?.length === 0 && !isLoading && (
          <div className="admin-empty">該当するユーザーが見つかりません</div>
        )}
      </div>

      {/* 編集モーダル */}
      {editingUser && (
        <div className="admin-modal-overlay" onClick={handleCancel}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>レベル編集</h2>
              <button className="admin-modal-close" onClick={handleCancel}>
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-modal-info">
                <p>
                  <strong>ユーザー:</strong> {editingUser.displayName || editingUser.loginId}
                </p>
                <p>
                  <strong>現在のレベル:</strong> Lv.{editingUser.level}
                </p>
                <p>
                  <strong>現在の累計EXP:</strong> {formatNumber(editingUser.totalExp)}
                </p>
              </div>

              <div className="admin-form-group">
                <label>新しいレベル</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={editLevel}
                  onChange={(e) => setEditLevel(Number(e.target.value))}
                  className="admin-input"
                />
              </div>

              <div className="admin-exp-preview">
                <span>変更後の累計EXP:</span>
                <strong>{formatNumber(calculateExpForLevel(editLevel))}</strong>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-cancel-btn" onClick={handleCancel}>
                キャンセル
              </button>
              <button
                className="admin-save-btn"
                onClick={handleSave}
                disabled={updateMutation.isPending || editLevel === editingUser.level}
              >
                {updateMutation.isPending ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
