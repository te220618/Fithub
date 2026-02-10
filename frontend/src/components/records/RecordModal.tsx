import { useState, useMemo, useCallback, useEffect } from 'react';
import type { TrainingRecord, WorkoutExercise, SaveWorkoutRequest, Tag } from '../../types';
import { findPreviousRecordForExercise } from '../../services/workoutApi';

interface RecordModalProps {
  date: string;
  record: TrainingRecord | null;
  records: TrainingRecord[];
  exercises: WorkoutExercise[];
  defaultTags: string[];
  customTags: Tag[];
  onClose: () => void;
  onSave: (data: SaveWorkoutRequest) => void;
  onDelete: (id: number) => void;
  onOpenCustomModal: () => void;
  onDeleteCustomExercise: (id: number) => void;
  isLoading: boolean;
  initialExerciseId?: number;
}

interface DeleteConfirmState {
  show: boolean;
  exerciseId: number;
  exerciseName: string;
}

export default function RecordModal({
  date,
  record,
  records,
  exercises,
  defaultTags,
  customTags,
  onClose,
  onSave,
  onOpenCustomModal,
  onDeleteCustomExercise,
  isLoading,
  initialExerciseId,
}: RecordModalProps) {
  const [step, setStep] = useState<'select' | 'input'>('select');
  const [selectedMuscle, setSelectedMuscle] = useState('all');
  const [selectedDefaultTag, setSelectedDefaultTag] = useState<string | null>(null);
  const [selectedCustomTag, setSelectedCustomTag] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise | null>(null);
  const [sets, setSets] = useState<{ weight: string; reps: string }[]>([{ weight: '', reps: '' }]);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<number, { weight?: string; reps?: string }>>({});

  // 初期表示時のデータロード
  useEffect(() => {
    if (initialExerciseId && record && exercises.length > 0) {
      const recordExercise = record.exercises.find((ex) => ex.id === initialExerciseId);
      if (recordExercise) {
        // Find matching workout exercise (try to match by name if exact ID match fails due to different types)
        // Note: recordExercise.id is the TrainingRecordExercise ID (primary key in training_record_exercises),
        // NOT the exercise_id. We need to find which exercise this corresponds to.
        // But wait, the previous logic passed 'ex.id' from RecordCard, which IS the TrainingRecordExercise ID.
        // We need the ACTUAL exercise definition to set selectedExercise.
        
        // Actually, RecordCard passes 'ex.id' where 'ex' is from record.exercises.
        // So initialExerciseId is indeed the TrainingRecordExercise ID (db table: training_record_exercises.id).
        
        // We need to find the definition in 'exercises' list.
        // recordExercise has name, muscle, custom, etc.
        const matchedExercise = exercises.find(e => e.name === recordExercise.name && e.muscle === recordExercise.muscle);
        
        if (matchedExercise) {
          setSelectedExercise(matchedExercise);
          if (recordExercise.sets && recordExercise.sets.length > 0) {
            setSets(recordExercise.sets.map(s => ({
              weight: String(s.weight),
              reps: String(s.reps)
            })));
          }
          setStep('input');
        } else {
          // If not found in master list (e.g. custom exercise deleted?), construct a temporary object
           const tempExercise: WorkoutExercise = {
            id: -1, // Dummy ID
            name: recordExercise.name,
            muscle: recordExercise.muscle,
            custom: recordExercise.custom,
            isCustom: recordExercise.custom,
            defaultTags: recordExercise.defaultTags,
            tags: recordExercise.tags
          };
          setSelectedExercise(tempExercise);
           if (recordExercise.sets && recordExercise.sets.length > 0) {
            setSets(recordExercise.sets.map(s => ({
              weight: String(s.weight),
              reps: String(s.reps)
            })));
          }
          setStep('input');
        }
      }
    }
  }, [initialExerciseId, record, exercises]);

  // カスタム種目削除確認ダイアログを表示
  const handleDeleteCustomExerciseClick = (e: React.MouseEvent, exerciseId: number, exerciseName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDeleteConfirm({ show: true, exerciseId, exerciseName });
  };

  // 削除を実行
  const handleConfirmDeleteExercise = () => {
    if (deleteConfirm) {
      onDeleteCustomExercise(deleteConfirm.exerciseId);
      setDeleteConfirm(null);
    }
  };

  // 削除をキャンセル
  const handleCancelDeleteExercise = () => {
    setDeleteConfirm(null);
  };

  // 3階層タグフィルタリング
  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      // 検索クエリ
      if (searchQuery && !ex.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // 部位フィルタ
      const muscleName = ex.muscle || ex.muscleGroupName;
      if (selectedMuscle !== 'all' && muscleName !== selectedMuscle) {
        return false;
      }

      // デフォルトタグ (ターゲット筋肉) フィルタ
      if (selectedDefaultTag) {
        if (!ex.defaultTags?.includes(selectedDefaultTag)) return false;
      }

      // カスタムタグフィルタ
      if (selectedCustomTag) {
        if (!ex.tags?.some(t => t.id === selectedCustomTag)) return false;
      }

      return true;
    });
  }, [exercises, searchQuery, selectedMuscle, selectedDefaultTag, selectedCustomTag]);

  // Muscle tabs
  const muscleTabs = ['all', '胸', '背中', '脚', '肩', '腕', 'その他'];

  // Select exercise
  const handleSelectExercise = (ex: WorkoutExercise) => {
    setSelectedExercise(ex);
    setStep('input');
  };

  // Set operations
  const addSet = () => setSets([...sets, { weight: '', reps: '' }]);
  const removeSet = (index: number) => setSets(sets.filter((_, i) => i !== index));
  const updateSet = (index: number, field: 'weight' | 'reps', value: string) => {
    const newSets = [...sets];
    newSets[index][field] = value;
    setSets(newSets);
  };

  // 前回コピー機能
  const handleCopyPrevious = useCallback(() => {
    if (!selectedExercise) return;

    const previousSets = findPreviousRecordForExercise(records, selectedExercise.id, date);

    if (previousSets && previousSets.length > 0) {
      setSets(
        previousSets.map((s) => ({
          weight: String(s.weight),
          reps: String(s.reps),
        }))
      );
    } else {
      alert('前回の記録が見つかりませんでした');
    }
  }, [selectedExercise, records, date]);

  // Save
  const handleSave = () => {
    if (!selectedExercise) return;
    
    // バリデーションエラーを収集
    const errors: Record<number, { weight?: string; reps?: string }> = {};
    sets.forEach((s, index) => {
      const setErrors: { weight?: string; reps?: string } = {};
      if (s.weight) {
        const weightValue = parseFloat(s.weight);
        if (Number.isNaN(weightValue) || weightValue < 0 || weightValue > 500) {
          setErrors.weight = '0〜500kgの範囲で入力';
        }
      }
      if (s.reps) {
        const repsValue = parseInt(s.reps, 10);
        if (Number.isNaN(repsValue) || repsValue < 0 || repsValue > 20) {
          setErrors.reps = '0〜20の範囲で入力';
        }
      }
      if (setErrors.weight || setErrors.reps) {
        errors[index] = setErrors;
      }
    });
    
    setValidationErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      return;
    }
    
    const validSets = sets.filter((s) => s.weight && s.reps);
    if (validSets.length === 0) return;

    onSave({
      date,
      exercises: [
        {
          exerciseId: selectedExercise.id,
          sets: validSets.map((s) => ({
            weight: parseFloat(s.weight),
            reps: parseInt(s.reps),
          })),
        },
      ],
    });
  };

  // 日付表示
  const dateObj = new Date(date);
  const dateDisplay = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

  return (
    <>
    <div className="modal-overlay active" id="recordModal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title" id="recordModalTitle">
            {initialExerciseId ? '記録を編集' : '記録を追加'} ({dateDisplay})
          </h3>
          <button className="modal-close" id="closeRecordModal" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" id="modalBody">
          {/* Step 1: Exercise Selection */}
          {step === 'select' ? (
            <div id="stepSelectExercise">
              {/* 3階層タブ: 部位 */}
              <div className="muscle-tabs" id="muscleTabs">
                {muscleTabs.map((muscle) => (
                  <button
                    key={muscle}
                    className={`muscle-tab${selectedMuscle === muscle && !selectedDefaultTag && !selectedCustomTag ? ' active' : ''}`}
                    data-muscle={muscle}
                    onClick={() => {
                      setSelectedMuscle(muscle);
                      setSelectedDefaultTag(null);
                      setSelectedCustomTag(null);
                    }}
                  >
                    {muscle === 'all' ? 'すべて' : muscle}
                  </button>
                ))}
              </div>

              {/* 3階層タブ: ターゲット筋肉（デフォルトタグ） */}
              {defaultTags.length > 0 ? (
                <div className="muscle-tabs" style={{ marginTop: 8 }}>
                  {defaultTags.map((tagName) => (
                    <button
                      key={tagName}
                      className={`muscle-tab tag-filter-tab default-tag-filter${selectedDefaultTag === tagName ? ' active' : ''}`}
                      data-type="defaultTag"
                      data-value={tagName}
                      onClick={() => {
                        setSelectedDefaultTag(selectedDefaultTag === tagName ? null : tagName);
                        setSelectedMuscle('all');
                        setSelectedCustomTag(null);
                      }}
                    >
                      {tagName}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* 3階層タブ: カスタムタグ */}
              {customTags.length > 0 ? (
                <div className="muscle-tabs" style={{ marginTop: 8 }}>
                  {customTags.map((tag) => (
                    <button
                      key={tag.id}
                      className={`muscle-tab tag-filter-tab${selectedCustomTag === tag.id ? ' active' : ''}`}
                      data-type="tag"
                      data-value={tag.id}
                      onClick={() => {
                        setSelectedCustomTag(selectedCustomTag === tag.id ? null : tag.id);
                        setSelectedMuscle('all');
                        setSelectedDefaultTag(null);
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              ) : null}

              <input
                type="text"
                className="exercise-search"
                id="exerciseSearch"
                placeholder="種目名を検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="exercise-list" id="exerciseList">
                {filteredExercises.length === 0 ? (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                    該当する種目がありません
                  </div>
                ) : (
                  filteredExercises.map((ex) => (
                    <div
                      key={ex.id}
                      className="exercise-card"
                      onClick={() => handleSelectExercise(ex)}
                      style={{ position: 'relative' }}
                    >
                      <div className="exercise-card-name">{ex.name}</div>
                      {/* カスタム種目の削除ボタン */}
                      {(ex.isCustom || ex.custom) && (
                        <span
                          className="custom-exercise-delete-btn"
                          onClick={(e) => handleDeleteCustomExerciseClick(e, ex.id, ex.name)}
                          title="種目を削除"
                        >
                          ×
                        </span>
                      )}
                      <div className="exercise-card-tags">
                        <span
                          className="exercise-card-tag muscle-tag"
                        >
                          {ex.muscle || ex.muscleGroupName}
                        </span>
                        {/* 種目マスターのデフォルトタグ（緑色） */}
                        {ex.defaultTags?.map((tag) => (
                          <span
                            key={tag}
                            className="exercise-card-tag default-tag"
                          >
                            {tag}
                          </span>
                        ))}
                        {/* ユーザーが追加したデフォルトタグ（紫色） */}
                        {ex.userAddedDefaultTags?.map((tag) => (
                          <span
                            key={`user-${tag}`}
                            className="exercise-card-tag default-tag user-added"
                          >
                            {tag}
                          </span>
                        ))}
                        {/* カスタムタグ（ゴールド） */}
                        {ex.tags?.map((tag) => (
                          <span
                            key={tag.id}
                            className="exercise-card-tag custom-tag"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <button
                  className="btn secondary"
                  id="btnCreateCustom"
                  style={{ width: '100%', fontSize: 13 }}
                  onClick={onOpenCustomModal}
                >
                  ＋ オリジナル種目を作成
                </button>
              </div>
            </div>
          ) : null}

          {/* Step 2: Record Input */}
          {step === 'input' && selectedExercise ? (
            <div id="stepInputRecord">
              <div className="record-header">
                <div className="record-exercise-name" id="inputExerciseName">
                  {selectedExercise.name}
                </div>
                <button
                  className="btn-change-exercise"
                  id="btnBackToSelect"
                  onClick={() => setStep('select')}
                >
                  種目を変更
                </button>
              </div>

              <div className="sets-container" id="setsContainer">
                {sets.map((set, index) => (
                  <div key={index} className="set-card">
                    <span className="set-number">{index + 1}</span>
                    <div className="set-inputs">
                      <div className="input-group">
                        <label className="input-label">重量 (kg)</label>
                        <input
                          type="number"
                          className={`weight-input${validationErrors[index]?.weight ? ' input-error' : ''}`}
                          value={set.weight}
                          onChange={(e) => {
                            updateSet(index, 'weight', e.target.value);
                            if (validationErrors[index]?.weight) {
                              setValidationErrors(prev => {
                                const updated = { ...prev };
                                if (updated[index]) {
                                  delete updated[index].weight;
                                  if (!updated[index].reps) delete updated[index];
                                }
                                return updated;
                              });
                            }
                          }}
                          placeholder="0"
                          step="0.5"
                          min="0"
                          max="500"
                        />
                        {validationErrors[index]?.weight && (
                          <span className="validation-error">{validationErrors[index].weight}</span>
                        )}
                      </div>
                      <div className="input-group">
                        <label className="input-label">回数</label>
                        <input
                          type="number"
                          className={`reps-input${validationErrors[index]?.reps ? ' input-error' : ''}`}
                          value={set.reps}
                          onChange={(e) => {
                            updateSet(index, 'reps', e.target.value);
                            if (validationErrors[index]?.reps) {
                              setValidationErrors(prev => {
                                const updated = { ...prev };
                                if (updated[index]) {
                                  delete updated[index].reps;
                                  if (!updated[index].weight) delete updated[index];
                                }
                                return updated;
                              });
                            }
                          }}
                          placeholder="0"
                          min="0"
                          max="20"
                        />
                        {validationErrors[index]?.reps && (
                          <span className="validation-error">{validationErrors[index].reps}</span>
                        )}
                      </div>
                    </div>
                    {sets.length > 1 ? (
                      <button
                        className="btn-delete-set"
                        onClick={() => removeSet(index)}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="form-actions">
                <button className="btn-add-set" id="btnAddSet" onClick={addSet}>
                  ＋ セット追加
                </button>
                <button className="btn-copy-prev" id="btnCopyPrev" onClick={handleCopyPrevious}>
                  <span>📋</span> 前回コピー
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {step === 'input' ? (
          <div className="modal-footer" id="modalFooter">
            <button className="btn secondary" id="btnCancelInput" onClick={() => {
              if (initialExerciseId) {
                // 編集モードの場合はモーダルを閉じる
                onClose();
              } else {
                // 新規追加の場合は種目選択に戻る
                setStep('select');
              }
            }}>
              キャンセル
            </button>
            <button
              className="btn-save"
              id="btnSaveRecord"
              onClick={handleSave}
              disabled={isLoading}
            >
              保存する
            </button>
          </div>
        ) : null}
      </div>
    </div>

    {/* 削除確認ダイアログ */}
    {deleteConfirm?.show ? (
      <div 
        className="modal-overlay active" 
        style={{ zIndex: 1100 }}
        onClick={(e) => e.target === e.currentTarget && handleCancelDeleteExercise()}
      >
        <div className="modal" style={{ maxWidth: '400px' }}>
          <div className="modal-header">
            <h3 className="modal-title">種目を削除</h3>
            <button className="modal-close" onClick={handleCancelDeleteExercise}>&times;</button>
          </div>
          <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
            <p style={{ marginBottom: '8px', color: 'var(--text)', fontSize: '15px' }}>
              種目「<strong style={{ color: 'var(--gold)' }}>{deleteConfirm.exerciseName}</strong>」を削除しますか？
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
              この操作は取り消せません。
            </p>
          </div>
          <div className="modal-footer" style={{ justifyContent: 'center', gap: '12px' }}>
            <button className="btn secondary" onClick={handleCancelDeleteExercise}>
              キャンセル
            </button>
            <button 
              className="btn-save" 
              onClick={handleConfirmDeleteExercise}
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
    </>
  );
}
