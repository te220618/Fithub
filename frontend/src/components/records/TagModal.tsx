import { useState, useEffect } from 'react';
import type { WorkoutExercise, Tag } from '../../types';

interface TagModalProps {
  exercises: WorkoutExercise[];
  defaultTags: string[];
  customTags: Tag[];
  onClose: () => void;
  onSave: (exerciseId: number, tagIds: number[], defaultTags: string[]) => void;
  onCreateTag: (name: string) => void;
  onDeleteTag: (id: number) => void;
  isLoading: boolean;
  isCreatingTag: boolean;
}

interface DeleteConfirmState {
  show: boolean;
  tagId: number;
  tagName: string;
}

export default function TagModal({
  exercises,
  defaultTags: allDefaultTags,
  customTags,
  onClose,
  onSave,
  onCreateTag,
  onDeleteTag,
  isLoading,
  isCreatingTag,
}: TagModalProps) {
  const [selectedExerciseId, setSelectedExerciseId] = useState<number>(exercises[0]?.id || 0);
  const [selectedDefaultTags, setSelectedDefaultTags] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  // 選択した種目を取得
  const selectedExercise = exercises.find((ex) => ex.id === selectedExerciseId);

  // 種目マスターのデフォルトタグ
  const masterDefaultTags = selectedExercise?.defaultTags || [];
  // ユーザーが追加したデフォルトタグ
  const userAddedDefaultTags = selectedExercise?.userAddedDefaultTags || [];

  // 種目が変わったときに現在の設定を反映
  useEffect(() => {
    if (selectedExercise) {
      // マスター + ユーザー追加の両方を含む
      setSelectedDefaultTags([...masterDefaultTags, ...userAddedDefaultTags]);
      setSelectedTagIds(selectedExercise.tags?.map((t) => t.id) || []);
    }
  }, [selectedExerciseId, selectedExercise, masterDefaultTags.join(','), userAddedDefaultTags.join(',')]);

  // デフォルトタグの選択状態を切り替え
  const toggleDefaultTag = (tagName: string) => {
    setSelectedDefaultTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  };

  // カスタムタグの選択状態を切り替え
  const toggleCustomTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  // デフォルトタグをリセット（マスターのみに戻す）
  const handleResetDefaultTags = () => {
    setSelectedDefaultTags([...masterDefaultTags]);
  };

  // 保存
  const handleSave = () => {
    if (selectedExerciseId > 0) {
      onSave(selectedExerciseId, selectedTagIds, selectedDefaultTags);
    }
  };

  // カスタムタグ追加
  const handleAddTag = () => {
    const trimmedName = newTagName.trim();
    if (trimmedName) {
      onCreateTag(trimmedName);
      setNewTagName('');
    }
  };

  // カスタムタグ削除確認ダイアログを表示
  const handleDeleteClick = (e: React.MouseEvent, tagId: number, tagName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteConfirm({ show: true, tagId, tagName });
  };

  // 削除を実行
  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      onDeleteTag(deleteConfirm.tagId);
      // 選択中のタグからも削除
      setSelectedTagIds((prev) => prev.filter((id) => id !== deleteConfirm.tagId));
      setDeleteConfirm(null);
    }
  };

  // 削除をキャンセル
  const handleCancelDelete = () => {
    setDeleteConfirm(null);
  };

  // カスタム種目の場合はタグ設定不可
  const isCustomExercise = selectedExerciseId < 0;

  // タグの種類を判定する関数
  const getTagType = (tagName: string): 'master' | 'user-added' => {
    return masterDefaultTags.includes(tagName) ? 'master' : 'user-added';
  };

  // リセットボタンを表示するか（変更があるときのみ）
  const hasDefaultTagChanges = () => {
    if (masterDefaultTags.length !== selectedDefaultTags.length) return true;
    // 現在の選択がマスターと完全一致するかチェック
    const masterSet = new Set(masterDefaultTags);
    const selectedSet = new Set(selectedDefaultTags);
    if (masterSet.size !== selectedSet.size) return true;
    for (const tag of masterSet) {
      if (!selectedSet.has(tag)) return true;
    }
    return false;
  };

  return (
    <div className="modal-overlay active" id="tagModal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">タグ設定</h3>
          <button className="modal-close" id="closeTagModal" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p className="modal-subtitle">
            種目にタグを付けて、絞り込み検索に活用できます。
          </p>

          <div className="form-group">
            <label className="form-label">種目を選択</label>
            <select
              className="form-input"
              id="tagExerciseSelect"
              value={selectedExerciseId}
              onChange={(e) => setSelectedExerciseId(parseInt(e.target.value))}
            >
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>

          {isCustomExercise ? (
            <div className="empty-tag-message" style={{ padding: 20, textAlign: 'center' }}>
              カスタム種目にはタグを設定できません
            </div>
          ) : (
            <>
              <div className="form-group">
                <div className="tag-section-header">
                  <label className="form-label tag-section-title">ターゲット筋肉（デフォルトタグ）</label>
                  {hasDefaultTagChanges() ? (
                    <button 
                      className="tag-reset-btn"
                      onClick={handleResetDefaultTags}
                      title="デフォルトに戻す"
                    >
                      リセット
                    </button>
                  ) : null}
                </div>
                <div className="tag-list" id="defaultTagList">
                  {allDefaultTags.length === 0 ? (
                    <div className="empty-tag-message">デフォルトタグがありません</div>
                  ) : (
                    allDefaultTags.map((tagName) => {
                      const tagType = getTagType(tagName);
                      const isSelected = selectedDefaultTags.includes(tagName);
                      const className = `tag-item default-tag-item-checkbox ${tagType}${isSelected ? ' selected' : ''}`;
                      
                      return (
                        <label
                          key={tagName}
                          className={className}
                          onClick={() => toggleDefaultTag(tagName)}
                        >
                          <span 
                            className="tag-color-dot" 
                            style={{ 
                              background: tagType === 'master' ? '#7bc47b' : '#a78bfa'
                            }}
                          ></span>
                          <span>{tagName}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="tag-legend">
                  <span className="tag-legend-item">
                    <span className="tag-legend-dot" style={{ background: '#7bc47b' }}></span>
                    デフォルト
                  </span>
                  <span className="tag-legend-item">
                    <span className="tag-legend-dot" style={{ background: '#a78bfa' }}></span>
                    自分で追加
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label tag-section-title">カスタムタグ</label>
                <div className="tag-list" id="tagList">
                  {customTags.length === 0 ? (
                    <div className="empty-tag-message">カスタムタグがありません。下で作成してください。</div>
                  ) : (
                    customTags.map((tag) => (
                      <label
                        key={tag.id}
                        className={`tag-item${selectedTagIds.includes(tag.id) ? ' selected' : ''}`}
                        onClick={() => toggleCustomTag(tag.id)}
                        style={{ position: 'relative', paddingRight: '32px' }}
                      >
                        <span className="tag-color-dot" style={{ background: tag.color || '#C9A227' }}></span>
                        <span>{tag.name}</span>
                        <span
                          className="tag-delete-btn"
                          onClick={(e) => handleDeleteClick(e, tag.id, tag.name)}
                          title="タグを削除"
                        >
                          ×
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="tag-create-area">
                <input
                  type="text"
                  className="form-input"
                  placeholder="新しいタグ名..."
                  maxLength={20}
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                />
                <button
                  className="btn"
                  onClick={handleAddTag}
                  disabled={isCreatingTag || !newTagName.trim()}
                >
                  {isCreatingTag ? '追加中...' : '追加'}
                </button>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={onClose}>閉じる</button>
          {!isCustomExercise ? (
            <button className="btn-save" onClick={handleSave} disabled={isLoading}>
              {isLoading ? '保存中...' : '保存する'}
            </button>
          ) : null}
        </div>
      </div>

      {/* 削除確認ダイアログ */}
      {deleteConfirm?.show ? (
        <div 
          className="modal-overlay active" 
          style={{ zIndex: 1100 }}
          onClick={(e) => e.target === e.currentTarget && handleCancelDelete()}
        >
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">タグを削除</h3>
              <button className="modal-close" onClick={handleCancelDelete}>&times;</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <p style={{ marginBottom: '8px', color: 'var(--text)', fontSize: '15px' }}>
                タグ「<strong style={{ color: 'var(--gold)' }}>{deleteConfirm.tagName}</strong>」を削除しますか？
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                この操作は取り消せません。
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn secondary" onClick={handleCancelDelete}>
                キャンセル
              </button>
              <button 
                className="btn-save" 
                onClick={handleConfirmDelete}
                style={{ 
                  background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
