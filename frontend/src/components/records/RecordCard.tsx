import React from 'react';
import type { TrainingRecord } from '../../types';
import { getPRSummaryForRecord, getPRKey, type PRData } from '../../services/workoutApi';

interface RecordCardProps {
  record: TrainingRecord;
  prData: PRData;
  isExpanded: boolean;
  animationDelay: number;
  onToggleExpand: () => void;
  onContextMenu: (e: React.MouseEvent, exerciseId: number, setId: number, weight: number, reps: number) => void;
  onAddExercise: () => void;
  onDelete: () => void;
}

export default function RecordCard({
  record,
  prData,
  isExpanded,
  animationDelay,
  onToggleExpand,
  onContextMenu,
  onAddExercise,
  onDelete,
}: RecordCardProps) {
  const { hasPR, hasNowPR, prSummary } = getPRSummaryForRecord(record, prData);

  const dateObj = new Date(record.date);
  const dateDisplay = `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]})`;

  return (
    <div
      id={`record-${record.date}`}
      className={`record-card infinite-scroll-item${isExpanded ? ' expanded' : ''}${hasNowPR ? ' has-now-pr' : hasPR ? ' has-pr' : ''}`}
      style={{ animationDelay: `${animationDelay}s` }}
    >
      <div className="record-card-header" onClick={onToggleExpand}>
        <div className="record-date">
          <span>📅</span> {dateDisplay}
          {hasNowPR ? (
            <span className="header-pr-star">★</span>
          ) : hasPR ? (
            <span className="header-pr-star past">★</span>
          ) : null}
        </div>
        <div className="record-header-right">
          <span className="record-count">{record.exercises?.length || 0}種目</span>
          <span className="record-expand-icon">▼</span>
        </div>
      </div>

      {/* PRサマリー */}
      {prSummary.length > 0 ? (
        <div className="record-pr-summary">
          {prSummary.map((p, idx) => {
            const badges: React.JSX.Element[] = [];

            // MAX重量PR
            if (p.isMaxWeightPR) {
              if (p.isCurrentMaxPR) {
                badges.push(<span key="maxpr" className="pr-badge now-pr">NOW PR!!</span>);
              } else {
                badges.push(<span key="maxpr" className="pr-badge">PR</span>);
              }
            }

            // repPR（MAX重量PRと同時の場合は表示しない）
            if (p.isRepPR && !p.isMaxWeightPR) {
              if (p.isCurrentRepPR) {
                badges.push(<span key="reppr" className="pr-badge now-rep-pr">NOW repPR!!</span>);
              } else {
                badges.push(<span key="reppr" className="pr-badge rep-pr">repPR</span>);
              }
            }

            const isNowItem = p.isCurrentMaxPR || p.isCurrentRepPR;

            return (
              <div key={idx} className={`pr-summary-item${isNowItem ? ' now-pr-item' : ''}`}>
                <span className="pr-exercise-name">{p.exercise}</span>
                <span className="pr-record">{p.weight}kg × {p.reps}回</span>
                {badges}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* 詳細 */}
      <div className="record-details">
        {record.exercises?.map((ex, exIdx) => (
          <div key={exIdx} className="record-exercise-item">
            <div className="record-exercise-name">{ex.name}</div>
            <div className="record-sets-list">
              {ex.sets?.map((s, setIdx) => {
                const prKey = getPRKey(record.date, ex.name, setIdx);
                const pr = prData[prKey];

                const prBadges: React.JSX.Element[] = [];
                if (pr) {
                  // MAX重量PR
                  if (pr.maxWeightPR) {
                    if (pr.isCurrentMaxPR) {
                      prBadges.push(<span key="maxpr" className="pr-badge now-pr">NOW PR!!</span>);
                    } else {
                      prBadges.push(<span key="maxpr" className="pr-badge">PR</span>);
                    }
                  }

                  // repPR（MAX重量PRと同時の場合は表示しない）
                  if (pr.repPR && !pr.maxWeightPR) {
                    if (pr.isCurrentRepPR) {
                      prBadges.push(<span key="reppr" className="pr-badge now-rep-pr">NOW repPR!!</span>);
                    } else {
                      prBadges.push(<span key="reppr" className="pr-badge rep-pr">repPR</span>);
                    }
                  }
                }

                return (
                  <div
                    key={setIdx}
                    className="record-set"
                    data-set-id={s.id}
                    data-weight={s.weight}
                    data-reps={s.reps}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onContextMenu(e, ex.id, s.id, s.weight, s.reps);
                    }}
                  >
                    <span className="set-number-badge">{setIdx + 1}</span>
                    {s.weight}kg × {s.reps}回 {prBadges}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="record-actions">
          <button className="btn-add-exercise" onClick={(e) => { e.stopPropagation(); onAddExercise(); }}>
            <span>＋</span> 種目を追加
          </button>
          <button className="btn-delete-record" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <span>🗑</span> この日の記録を削除
          </button>
        </div>
      </div>
    </div>
  );
}
