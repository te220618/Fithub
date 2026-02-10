import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  getWorkoutRecords,
  getWorkoutRecordsPaged,
  getWorkoutExercises,
  getMuscleGroups,
  getDefaultTags,
  getTags,
  saveWorkoutRecord,
  deleteWorkoutRecord,
  deleteWorkoutSet,
  createCustomExercise,
  deleteCustomExercise,
  updateExerciseTags,
  createTag,
  deleteTag,
  calculatePRs,
  dateHasPR,
  dateHasCurrentPR,
} from '../services/workoutApi';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import type { TrainingRecord, WorkoutExercise } from '../types';
import { useWindowEventListener } from '../hooks';
import RecordCard from '../components/records/RecordCard';
import RecordModal from '../components/records/RecordModal';
import CustomExerciseModal from '../components/records/CustomExerciseModal';
import TagModal from '../components/records/TagModal';
import '../styles/records.css';

export default function Records() {
  const queryClient = useQueryClient();
  const { fetchUser } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TrainingRecord | null>(null);

  // 分岐ダイアログ用
  const [actionDialog, setActionDialog] = useState<{
    show: boolean;
    dateStr: string;
    recordId?: number;
  } | null>(null);

  // コンテキストメニュー用
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    recordId: number;
    exerciseId?: number;
    setId?: number;
    weight?: number;
    reps?: number;
  } | null>(null);

  // 編集初期化用
  const [initialEditExerciseId, setInitialEditExerciseId] = useState<number | undefined>(undefined);

  // 削除確認モーダル用
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    type: 'record' | 'set';
    id: number;
    displayText: string;
  } | null>(null);

  // レベルアップ演出用（Zustand）
  const { showLevelUp, showToast } = useUIStore();

  // 展開中のカード
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  // Data fetching - 全記録 (PR計算用)
  const { data: rawAllRecords } = useQuery({
    queryKey: ['workoutRecords'],
    queryFn: getWorkoutRecords,
  });

  const allRecords = Array.isArray(rawAllRecords) ? rawAllRecords : [];

  // 無限スクロール用ページネーション
  const {
    data: pagedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['workoutRecordsPaged'],
    queryFn: ({ pageParam = 0 }) => getWorkoutRecordsPaged(pageParam, 20),
    getNextPageParam: (lastPage, pages) => {
      return lastPage.last ? undefined : pages.length;
    },
    initialPageParam: 0,
  });

  // ページネーションされた記録を平坦化
  const displayedRecords = useMemo(() => {
    return pagedData?.pages.flatMap((page) => page.content) || [];
  }, [pagedData]);

  // PRデータを計算（メモ化）
  const prCalculation = useMemo(() => {
    return calculatePRs(allRecords);
  }, [allRecords]);

  const prData = prCalculation.prData;

  const { data: rawExercises } = useQuery({
    queryKey: ['workoutExercises'],
    queryFn: getWorkoutExercises,
  });
  const exercises = Array.isArray(rawExercises) ? rawExercises : [];

  const { data: rawMuscleGroups } = useQuery({
    queryKey: ['muscleGroups'],
    queryFn: getMuscleGroups,
  });
  const muscleGroups = Array.isArray(rawMuscleGroups) ? rawMuscleGroups : [];

  const { data: rawDefaultTags } = useQuery({
    queryKey: ['defaultTags'],
    queryFn: getDefaultTags,
  });
  const defaultTags = Array.isArray(rawDefaultTags) ? rawDefaultTags : [];

  const { data: rawCustomTags } = useQuery({
    queryKey: ['customTags'],
    queryFn: getTags,
  });
  const customTags = Array.isArray(rawCustomTags) ? rawCustomTags : [];

  // Mutations
  const saveMutation = useMutation({
    mutationFn: saveWorkoutRecord,
    onSuccess: (data) => {
      console.log('[Records] Save response:', data);
      console.log('[Records] newLevel:', data.newLevel, 'expGained:', data.expGained);
      
      queryClient.invalidateQueries({ queryKey: ['workoutRecords'] });
      queryClient.invalidateQueries({ queryKey: ['workoutRecordsPaged'] });
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      queryClient.invalidateQueries({ queryKey: ['heatmap'] });
      queryClient.invalidateQueries({ queryKey: ['streaks'] });
      queryClient.invalidateQueries({ queryKey: ['petStatus'] });
      queryClient.invalidateQueries({ queryKey: ['barn'] });
      // Refresh user data to update level display
      fetchUser();
      setIsRecordModalOpen(false);
      setEditingRecord(null);

      // レベルアップチェック
      if (data.newLevel) {
        const newLevel = data.newLevel;
        const expGained = data.expGained || 0;
        console.log('[Records] Level up detected! Showing celebration for level:', newLevel);
        // Zustandでグローバル管理（コンポーネント再マウントに影響されない）
        showLevelUp(newLevel, expGained);
      } else {
        console.log('[Records] No level up (newLevel is falsy)');
      }
    },
    onError: (error: any) => {
      const status = error?.response?.status;
      if (status === 400) {
        const message = error?.response?.data?.message;
        showToast(message || '入力内容を確認してください', 'error');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkoutRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutRecords'] });
      queryClient.invalidateQueries({ queryKey: ['workoutRecordsPaged'] });
      queryClient.invalidateQueries({ queryKey: ['userStats'] });
      queryClient.invalidateQueries({ queryKey: ['heatmap'] });
      queryClient.invalidateQueries({ queryKey: ['streaks'] });
      queryClient.invalidateQueries({ queryKey: ['petStatus'] });
      queryClient.invalidateQueries({ queryKey: ['barn'] });
      fetchUser();
      setIsRecordModalOpen(false);
      setContextMenu(null);
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: deleteWorkoutSet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutRecords'] });
      queryClient.invalidateQueries({ queryKey: ['workoutRecordsPaged'] });
      setContextMenu(null);
    },
  });

  const createCustomMutation = useMutation({
    mutationFn: createCustomExercise,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutExercises'] });
      setIsCustomModalOpen(false);
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: ({ exerciseId, tagIds, defaultTags }: { exerciseId: number; tagIds: number[]; defaultTags: string[] }) =>
      updateExerciseTags(exerciseId, tagIds, defaultTags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutExercises'] });
      setIsTagModalOpen(false);
    },
  });

  const createTagMutation = useMutation({
    mutationFn: (name: string) => createTag(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customTags'] });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customTags'] });
    },
  });

  const deleteCustomExerciseMutation = useMutation({
    mutationFn: (id: number) => deleteCustomExercise(id),
    onSuccess: (_, deletedId) => {
      // 即座にキャッシュを更新
      queryClient.setQueryData<WorkoutExercise[]>(['workoutExercises'], (old) =>
        old ? old.filter(ex => ex.id !== deletedId) : []
      );
    },
  });

  // 無限スクロールの監視
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // コンテキストメニューを閉じる
  useWindowEventListener('click', () => setContextMenu(null));
  useWindowEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setContextMenu(null);
      setActionDialog(null);
    }
  });

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  // Build calendar days array
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // 記録がある日付のセット
  const recordDates = useMemo(() => {
    return new Set(allRecords.map((r) => r.date));
  }, [allRecords]);

  // Get records for a specific date
  const getRecordsForDate = useCallback(
    (day: number) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return allRecords.filter((r) => r.date === dateStr);
    },
    [allRecords, year, month]
  );

  // Navigation
  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  // カレンダー日付クリック - 記録があれば直接スクロール
  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayRecords = getRecordsForDate(day);

    if (dayRecords.length > 0) {
      // 記録がある場合は直接スクロール＆展開
      const cardElement = document.getElementById(`record-${dateStr}`);
      if (cardElement) {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cardElement.style.animation = 'none';
        setTimeout(() => {
          cardElement.style.animation = 'highlight 1s';
        }, 10);
      }
      // カードを展開
      const record = allRecords.find((r) => r.date === dateStr);
      if (record) {
        setExpandedCards((prev) => new Set(prev).add(record.id));
      }
    } else {
      // 記録がない場合は新規追加
      setSelectedDate(dateStr);
      setEditingRecord(null);
      setIsRecordModalOpen(true);
    }
  };

  // 分岐ダイアログのアクション
  const handleActionDialogView = () => {
    if (!actionDialog) return;
    setActionDialog(null);

    // 該当記録カードへスクロール
    const cardElement = document.getElementById(`record-${actionDialog.dateStr}`);
    if (cardElement) {
      cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cardElement.style.animation = 'none';
      setTimeout(() => {
        cardElement.style.animation = 'highlight 1s';
      }, 10);
      // カードを展開
      const record = allRecords.find((r) => r.date === actionDialog.dateStr);
      if (record) {
        setExpandedCards((prev) => new Set(prev).add(record.id));
      }
    }
  };

  const handleActionDialogAdd = () => {
    if (!actionDialog) return;
    setSelectedDate(actionDialog.dateStr);
    setEditingRecord(null);
    setActionDialog(null);
    setIsRecordModalOpen(true);
  };

  // カード展開トグル
  const toggleCardExpand = (recordId: number) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  // 右クリックハンドラー
  const handleContextMenu = (
    e: React.MouseEvent,
    recordId: number,
    exerciseId?: number,
    setId?: number,
    weight?: number,
    reps?: number
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      recordId,
      exerciseId,
      setId,
      weight,
      reps,
    });
  };

  // 削除確認モーダルを表示
  const showDeleteConfirm = (type: 'record' | 'set', id: number, displayText: string) => {
    setDeleteConfirm({ show: true, type, id, displayText });
  };

  // 削除を実行
  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'record') {
      deleteMutation.mutate(deleteConfirm.id);
    } else {
      deleteSetMutation.mutate(deleteConfirm.id);
    }
    setDeleteConfirm(null);
  };

  // 削除をキャンセル
  const handleCancelDelete = () => {
    setDeleteConfirm(null);
  };

  // Today check
  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <div className="container">
      {/* Calendar Section */}
      <section className="calendar-section">
        <div className="calendar-header">
          <h2 className="calendar-title" id="calendarTitle">
            {year}年 {month + 1}月
          </h2>
          <div className="calendar-nav">
            <button className="calendar-nav-btn" id="prevMonthBtn" onClick={goToPrevMonth}>&lt;</button>
            <button className="calendar-nav-btn" id="todayBtn" onClick={goToToday}>今月</button>
            <button className="calendar-nav-btn" id="nextMonthBtn" onClick={goToNextMonth}>&gt;</button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="calendar-grid">
          {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
            <div key={day} className="calendar-day-header">{day}</div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="calendar-grid" id="calendarGrid">
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <div key={index} className="calendar-day empty" />;
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasRecord = recordDates.has(dateStr);
            const hasPR = dateHasPR(prData, dateStr);
            const hasCurrentPR = dateHasCurrentPR(prData, dateStr);
            const isTodayDate = isToday(day);
            const isSelected = selectedDate === dateStr;

            return (
              <div
                key={index}
                className={`calendar-day${isTodayDate ? ' today' : ''}${hasRecord ? ' has-record' : ''}${hasPR ? ' has-pr' : ''}${isSelected ? ' selected' : ''}`}
                onClick={() => handleDayClick(day)}
              >
                {day}
                {hasPR ? (
                  <span className={`pr-star${hasCurrentPR ? '' : ' past'}`}>★</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Action buttons */}
      <div className="actions">
        <button
          className="btn"
          id="addRecordBtn"
          onClick={() => {
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            setSelectedDate(todayStr);
            setEditingRecord(null);
            setIsRecordModalOpen(true);
          }}
        >
          ＋ 記録をつける
        </button>
        <button
          className="btn secondary"
          id="editTagsBtn"
          onClick={() => setIsTagModalOpen(true)}
        >
          タグ設定
        </button>
      </div>

      {/* Records list section */}
      <section id="recordsListSection">
        <h3 className="tag-section-title" style={{ marginBottom: 16 }}>過去の記録</h3>
        <div id="recordsList">
          {displayedRecords.map((record, index) => (
            <RecordCard
              key={record.id}
              record={record}
              prData={prData}
              isExpanded={expandedCards.has(record.id)}
              animationDelay={index % 20 * 0.03}
              onToggleExpand={() => toggleCardExpand(record.id)}
              onContextMenu={(e, exerciseId, setId, weight, reps) =>
                handleContextMenu(e, record.id, exerciseId, setId, weight, reps)
              }
              onAddExercise={() => {
                setSelectedDate(record.date);
                setEditingRecord(null);
                setInitialEditExerciseId(undefined);
                setIsRecordModalOpen(true);
              }}
              onDelete={() => showDeleteConfirm('record', record.id, record.date)}
            />
          ))}
        </div>

        {/* 無限スクロールセンチネル - 記録がある場合のみ表示 */}
        {displayedRecords.length > 0 ? (
          <div ref={sentinelRef} id="recordsScrollSentinel" className="infinite-scroll-sentinel" />
        ) : null}

        {isFetchingNextPage ? (
          <div id="recordsScrollLoading" className="infinite-scroll-loading">
            <div className="infinite-scroll-spinner"></div>
            <span>読み込み中...</span>
          </div>
        ) : null}

        {!hasNextPage && displayedRecords.length > 0 ? (
          <div className="infinite-scroll-end">すべての記録を表示しました</div>
        ) : null}

        {displayedRecords.length === 0 ? (
          <div className="empty" id="emptyState">
            記録がありません
          </div>
        ) : null}
      </section>

      {/* Action Dialog (分岐ダイアログ) */}
      {actionDialog?.show ? (
        <div className="modal-overlay active" onClick={() => setActionDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">{actionDialog.dateStr}</h3>
              <button className="modal-close" onClick={() => setActionDialog(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <p style={{ marginBottom: 24, color: 'var(--text)' }}>
                この日の記録があります。<br />どうしますか？
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn secondary" onClick={handleActionDialogView}>
                記録を見る
              </button>
              <button className="btn-save" onClick={handleActionDialogAdd}>
                新しい種目を追加
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Context Menu */}
      {contextMenu ? (
        <div
          className="context-menu active"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.setId ? (
            <>
              <div
                className="context-menu-item"
                onClick={() => {
                  const record = allRecords.find((r) => r.id === contextMenu.recordId);
                  if (record) {
                    setSelectedDate(record.date);
                    setEditingRecord(record);
                    setInitialEditExerciseId(contextMenu.exerciseId);
                    setIsRecordModalOpen(true);
                  }
                  setContextMenu(null);
                }}
              >
                📝 編集
              </div>
              <div
                className="context-menu-item danger"
                id="contextMenuDelete"
                onClick={() => {
                  showDeleteConfirm('set', contextMenu.setId!, `${contextMenu.weight}kg × ${contextMenu.reps}回`);
                  setContextMenu(null);
                }}
              >
                <span>🗑</span> {contextMenu.weight}kg × {contextMenu.reps}回 を削除
              </div>
            </>
          ) : (
            // カード全体の右クリックメニューは廃止のため何も表示しない
            null
          )}
        </div>
      ) : null}

      {/* Record Modal */}
      {isRecordModalOpen ? (
        <RecordModal
          date={selectedDate || new Date().toISOString().split('T')[0]}
          record={editingRecord}
          records={allRecords}
          exercises={exercises}
          defaultTags={defaultTags}
          customTags={customTags}
          initialExerciseId={initialEditExerciseId}
          onClose={() => {
            setIsRecordModalOpen(false);
            setEditingRecord(null);
            setInitialEditExerciseId(undefined);
          }}
          onSave={(data) => saveMutation.mutate(data)}
          onDelete={(id) => deleteMutation.mutate(id)}
          onOpenCustomModal={() => setIsCustomModalOpen(true)}
          onDeleteCustomExercise={(id) => deleteCustomExerciseMutation.mutate(id)}
          isLoading={saveMutation.isPending}
        />
      ) : null}

      {/* Custom Exercise Modal */}
      {isCustomModalOpen ? (
        <CustomExerciseModal
          muscleGroups={muscleGroups}
          onClose={() => setIsCustomModalOpen(false)}
          onSave={(name, muscleGroupId) => {
            const muscle = muscleGroups.find(mg => mg.id === muscleGroupId)?.name || 'other';
            createCustomMutation.mutate({ name, muscle });
          }}
          isLoading={createCustomMutation.isPending}
        />
      ) : null}

      {/* Tag Modal */}
      {isTagModalOpen ? (
        <TagModal
          exercises={exercises}
          defaultTags={defaultTags}
          customTags={customTags}
          onClose={() => setIsTagModalOpen(false)}
          onSave={(exerciseId, tagIds, defaultTagsToSave) =>
            updateTagsMutation.mutate({ exerciseId, tagIds, defaultTags: defaultTagsToSave })
          }
          onCreateTag={(name) => createTagMutation.mutate(name)}
          onDeleteTag={(id) => deleteTagMutation.mutate(id)}
          isLoading={updateTagsMutation.isPending}
          isCreatingTag={createTagMutation.isPending}
        />
      ) : null}

      {/* 削除確認モーダル */}
      {deleteConfirm?.show ? (
        <div 
          className="modal-overlay active" 
          style={{ zIndex: 1100 }}
          onClick={(e) => e.target === e.currentTarget && handleCancelDelete()}
        >
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {deleteConfirm.type === 'record' ? '記録を削除' : 'セットを削除'}
              </h3>
              <button className="modal-close" onClick={handleCancelDelete}>&times;</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <p style={{ marginBottom: '8px', color: 'var(--text)', fontSize: '15px' }}>
                {deleteConfirm.type === 'record' ? (
                  <>
                    <strong style={{ color: 'var(--gold)' }}>{deleteConfirm.displayText}</strong> の記録を削除しますか？
                  </>
                ) : (
                  <>
                    <strong style={{ color: 'var(--gold)' }}>{deleteConfirm.displayText}</strong> を削除しますか？
                  </>
                )}
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                この操作は取り消せません。
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center', gap: '12px' }}>
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
