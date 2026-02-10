import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dailyRewardApi from '../../services/dailyRewardApi';
import type { DailyRewardDay } from '../../services/dailyRewardApi';
import { useUIStore } from '../../stores/uiStore';
import { useWindowEventListener } from '../../hooks';

import '../../styles/daily-reward.css';

interface DailyRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoClaimOnOpen?: boolean;
}

export default function DailyRewardModal({ isOpen, onClose, autoClaimOnOpen = false }: DailyRewardModalProps) {
  const queryClient = useQueryClient();
  const { showToast } = useUIStore();
  const [hasAutoClaimed, setHasAutoClaimed] = useState(false);

  // Fetch reward status
  const { data: rewardData, isLoading } = useQuery({
    queryKey: ['dailyRewards'],
    queryFn: dailyRewardApi.getRewards,
    enabled: isOpen,
  });

  // Claim mutation
  const claimMutation = useMutation({
    mutationFn: dailyRewardApi.claimReward,
    onSuccess: (data) => {
      if (!data.alreadyClaimed) {
        // Show reward toast
        const rewardText = [];
        if (data.expEarned > 0) rewardText.push(`${data.expEarned} EXP`);
        showToast(`🎁 Day ${data.rewardDay} 報酬獲得！ ${rewardText.join(' + ')}`, 'success');
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['dailyRewards'] });
        queryClient.invalidateQueries({ queryKey: ['userStats'] });
        queryClient.invalidateQueries({ queryKey: ['userInfo'] });
      }
    },
    onError: () => {
      showToast('報酬の受け取りに失敗しました', 'error');
    },
  });

  // Auto claim on open if requested
  useEffect(() => {
    if (isOpen && 
        autoClaimOnOpen && 
        rewardData && 
        !rewardData.todayClaimed && 
        !hasAutoClaimed &&
        !claimMutation.isPending
    ) {
      setHasAutoClaimed(true);
      claimMutation.mutate();
    }
  }, [isOpen, autoClaimOnOpen, rewardData, hasAutoClaimed, claimMutation]);

  // Reset auto claim flag when closed
  useEffect(() => {
    if (!isOpen) {
      setHasAutoClaimed(false);
    }
  }, [isOpen]);

  // ESC key to close
  useWindowEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    { enabled: isOpen }
  );

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClaim = () => {
    if (!rewardData?.todayClaimed) {
      claimMutation.mutate();
    }
  };

  const renderTile = (day: DailyRewardDay, currentDay: number, todayClaimed: boolean) => {
    const isToday = day.day === currentDay && !todayClaimed;
    const isClaimed = day.claimed;
    const isFuture = day.day > currentDay || (day.day === currentDay && todayClaimed);
    const isBig = day.isBigReward;

    let tileClass = 'reward-tile';
    if (isClaimed) tileClass += ' claimed';
    if (isToday) tileClass += ' today';
    if (isFuture && !isClaimed) tileClass += ' future';
    if (isBig) tileClass += ' big-reward';

    // Determine what to show
    let content: React.ReactNode;
    if (isClaimed) {
      // Show checkmark and reward
      content = (
        <>
          <span className="tile-check">✓</span>
          <span className="tile-reward">
            {day.exp} EXP
          </span>
        </>
      );
    } else if (isBig) {
      // Show big reward preview
      content = (
        <>
          <span className="tile-icon">{day.day === 14 ? '🎁🎁' : '🎁'}</span>
          <span className="tile-reward">{day.exp} EXP</span>
        </>
      );
    } else if (isToday) {
      // Today's unclaimed
      content = (
        <>
          <span className="tile-icon">⭐</span>
          <span className="tile-reward">
            {day.exp} EXP
          </span>
        </>
      );
    } else {
      // Future day - show ?
      content = <span className="tile-mystery">?</span>;
    }

    return (
      <div key={day.day} className={tileClass}>
        <div className="tile-content">{content}</div>
        <div className="tile-day">Day {day.day}</div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="daily-reward-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        
        <div className="modal-header">
          <h2>🎁 デイリーリワード</h2>
          {rewardData ? (
            <p className="reward-progress">
              Day {rewardData.currentDay}/14
            </p>
          ) : null}
        </div>

        {isLoading ? (
          <div className="reward-loading">読み込み中...</div>
        ) : rewardData ? (
          <>
            <div className="reward-grid">
              {/* Week 1 */}
              <div className="reward-week">
                {rewardData.days.slice(0, 7).map((day) => 
                  renderTile(day, rewardData.currentDay, rewardData.todayClaimed)
                )}
              </div>
              {/* Week 2 */}
              <div className="reward-week">
                {rewardData.days.slice(7, 14).map((day) => 
                  renderTile(day, rewardData.currentDay, rewardData.todayClaimed)
                )}
              </div>
            </div>

            <div className="reward-footer">
              {rewardData.todayClaimed ? (
                <button className="claim-btn claimed" disabled>
                  ✓ 本日の報酬は受取済み
                </button>
              ) : (
                <button 
                  className="claim-btn" 
                  onClick={handleClaim}
                  disabled={claimMutation.isPending}
                >
                  {claimMutation.isPending ? '受け取り中...' : '✨ 今日の報酬を受け取る'}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="reward-error">データの取得に失敗しました</div>
        )}
      </div>
    </div>
  );
}
