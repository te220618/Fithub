import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
// import { isDeveloper } from '../config/navItems';
import { getHeatmapData, getUserStats } from '../services/workoutApi';
import streakApi from '../services/streakApi';
import petApi from '../services/petApi';
// import dailyRewardApi from '../services/dailyRewardApi';
// import DailyRewardModal from '../components/layout/DailyRewardModal';
import { useWindowEventListener } from '../hooks';

import '../styles/dashboard.css';

// Types
interface HeatmapData {
  [date: string]: number;
}

interface RecentRecord {
  date: string;
  exerciseCount: number;
  totalVolume: number;
  setCount: number;
  primaryMuscles: string[];
  expEarned: number;
}

interface DailyVolume {
  date: string;
  volume: number;
}

interface MuscleStatus {
  muscleName: string;
  lastTrained: string | null;
  daysSinceLastTrained: number;
  status: 'recovering' | 'ready' | 'stale';
}

// Constants
const MOBILE_BREAKPOINT = 768;
const EXTRA_SMALL_BREAKPOINT = 360;
const SWIPE_THRESHOLD = 0.25;

// Helper to get current quarter from month (0-11)
function getCurrentQuarter(month: number): 1 | 2 | 3 | 4 {
  if (month < 3) return 1;
  if (month < 6) return 2;
  if (month < 9) return 3;
  return 4;
}

// Utility: format date as YYYY-MM-DD (timezone safe)
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  // State
  const [selectedYear, setSelectedYear] = useState(currentYear);
  // デフォルトで現在の月に基づいて上半期/下半期を選択（7月以降は下半期）
  const [currentHalf, setCurrentHalf] = useState<'first' | 'second'>(() =>
    new Date().getMonth() >= 6 ? 'second' : 'first'
  );
  // 四半期表示用（極小画面用）
  const [currentQuarter, setCurrentQuarter] = useState<1 | 2 | 3 | 4>(() =>
    getCurrentQuarter(new Date().getMonth())
  );
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BREAKPOINT);
  const [isExtraSmall, setIsExtraSmall] = useState(window.innerWidth < EXTRA_SMALL_BREAKPOINT);
  // const [showDailyRewardModal, setShowDailyRewardModal] = useState(false);
  // const [autoClaimOnOpen, setAutoClaimOnOpen] = useState(false);

  // Available years for selector
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  const handleViewportResize = useCallback(() => {
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    setIsExtraSmall(window.innerWidth < EXTRA_SMALL_BREAKPOINT);
  }, []);

  // Check mobile on resize
  useWindowEventListener('resize', handleViewportResize);

  // Fetch heatmap data for current year
  const { data: heatmapResponse } = useQuery({
    queryKey: ['heatmap', selectedYear],
    queryFn: () => getHeatmapData(selectedYear),
  });

  // Prefetch adjacent years for smooth swiping
  useEffect(() => {
    const prefetchYear = (year: number) => {
      if (year >= minYear && year <= maxYear) {
        queryClient.prefetchQuery({
          queryKey: ['heatmap', year],
          queryFn: () => getHeatmapData(year),
        });
      }
    };

    // Prefetch prev and next year
    prefetchYear(selectedYear - 1);
    prefetchYear(selectedYear + 1);
  }, [selectedYear, queryClient, minYear, maxYear]);

  // Fetch user stats
  const { data: userStats } = useQuery({
    queryKey: ['userStats'],
    queryFn: getUserStats,
  });

  // Fetch streak data
  const { data: streakData } = useQuery({
    queryKey: ['streaks'],
    queryFn: streakApi.getStreaks,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fetch pet status
  const { data: petData } = useQuery({
    queryKey: ['petStatus'],
    queryFn: petApi.getPet,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch daily reward data for auto-popup
  /*
  const { data: dailyRewardData } = useQuery({
    queryKey: ['dailyRewards'],
    queryFn: dailyRewardApi.getRewards,
    retry: false,
    refetchOnWindowFocus: false,
  });
  */


  // Auto-open daily reward modal if not claimed today (developers only)
  /*
  useEffect(() => {
    if (isDeveloper(user?.displayName) && dailyRewardData && !dailyRewardData.todayClaimed) {
      setAutoClaimOnOpen(true);
      setShowDailyRewardModal(true);
    }
  }, [dailyRewardData, user?.displayName]);
  */

  const heatmapData = heatmapResponse?.heatmapData || {};
  const volumeData = heatmapResponse?.volumeData || {};

  // Calculate weekly workouts and changes
  const weeklyWorkouts = userStats?.weeklyWorkouts ?? 0;
  const weeklyWorkoutsChange = userStats?.weeklyWorkoutsChange ?? 0;
  const totalVolume = userStats?.totalVolume ?? 0;

  // Use new streak API data
  const trainingStreak = streakData?.training_streak?.current ?? userStats?.currentStreak ?? 0;
  const loginStreak = streakData?.login_streak?.current ?? 0;
  const bestTrainingStreak = streakData?.training_streak?.best ?? 0;

  // Multipliers from streak API
  const trainingMultiplier = streakData?.trainingMultiplier ?? 0;
  const loginMultiplier = streakData?.loginMultiplier ?? 0;

  // Pet info
  const activePet = petData?.hasPet && petData?.pet ? petData.pet : null;

  // Daily reward info
  // const hasUnclaimedReward = dailyRewardData && !dailyRewardData.todayClaimed;

  // Level info
  const userLevel = user?.level ?? 1;
  const userExpInLevel = user?.currentExp ?? 0;
  const userExpToNext = user?.expToNextLevel ?? 1000;
  const userLevelProgress = Math.round((userExpInLevel / (userExpInLevel + userExpToNext)) * 100);

  // Today's date formatted
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // Recent records
  const recentRecords: RecentRecord[] = userStats?.recentRecords ?? [];
  const weeklyVolumeHistory: DailyVolume[] = userStats?.weeklyVolumeHistory ?? [];
  const muscleStatuses: MuscleStatus[] = (userStats?.muscleStatuses ?? []) as MuscleStatus[];

  // Subtitle text
  const subtitleText = (() => {
    if (!isMobile) return `${selectedYear}年のトレーニング記録`;
    if (isExtraSmall) {
      const quarterNames = ['1-3月', '4-6月', '7-9月', '10-12月'];
      return `${selectedYear}年 ${quarterNames[currentQuarter - 1]} のトレーニング記録`;
    }
    return `${selectedYear}年 ${currentHalf === 'first' ? '上半期' : '下半期'} のトレーニング記録`;
  })();

  // Handle year selector change
  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(Number(e.target.value));
    setCurrentHalf('first'); // Reset to first half when year changes
    setCurrentQuarter(1); // Reset to Q1 when year changes
  };

  // Handle half year selector change
  const handleHalfChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentHalf(e.target.value as 'first' | 'second');
  };

  // Handle quarter selector change (extra small screens)
  const handleQuarterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentQuarter(Number(e.target.value) as 1 | 2 | 3 | 4);
  };

  return (
    <div className="container">
      {/* ウェルカムカード */}
      <section className="welcome-card">
        <div className="welcome-content">
          <h1 className="welcome-title">
            おかえりなさい、<span>{user?.displayName || 'ゲスト'}</span>さん！
          </h1>
          <p className="welcome-subtitle">{today}</p>
          {/* {isDeveloper(user?.displayName) ? (
            <button
              className={`daily-reward-btn ${hasUnclaimedReward ? 'has-reward' : ''}`}
              onClick={() => {
                setAutoClaimOnOpen(false);
                setShowDailyRewardModal(true);
              }}
            >
              🎁 デイリーリワード
              {dailyRewardData ? (
                <span>Day {dailyRewardData.currentDay}/14</span>
              ) : null}
            </button>
          ) : null} */}
        </div>
        <div className="welcome-decoration">💪</div>
      </section>

      {/* レベル・経験値カード */}
      <section className="card level-card">
        <div className="level-card-content">
          <div className="level-info">
            <div className="level-main">
              <span className="level-label">Level</span>
              <span className="level-number">{userLevel}</span>
            </div>
            <div className="exp-details">
              <div className="exp-text">
                {userExpInLevel} / {userExpInLevel + userExpToNext} EXP
              </div>
              <div className="exp-to-next">
                次のレベルまで {userExpToNext} EXP
              </div>
            </div>
          </div>
          <div className="level-progress-container">
            <div className="level-progress-bar-large">
              <div
                className="level-progress-fill"
                style={{ width: `${userLevelProgress}%` }}
              />
            </div>
            <span className="level-progress-percent">{userLevelProgress}%</span>
          </div>
        </div>
      </section>

      {/* 統計カード（6列: 3×2グリッド） */}
      <section className="stats-grid stats-grid-6">
        <div className="stat-card" style={{ animationDelay: '0.1s' }}>
          <div className="stat-icon">🏋️</div>
          <div className="stat-label">週のワークアウト</div>
          <div className="stat-value-row">
            <span className="stat-value">{weeklyWorkouts}</span>
            <span className="stat-unit">回</span>
          </div>
          {weeklyWorkoutsChange !== 0 ? (
            <div className={`stat-change ${weeklyWorkoutsChange >= 0 ? 'positive' : 'negative'}`}>
              {weeklyWorkoutsChange > 0 ? '+' : ''}{weeklyWorkoutsChange}
            </div>
          ) : null}
        </div>

        <div className="stat-card" style={{ animationDelay: '0.15s' }}>
          <div className="stat-icon">📊</div>
          <div className="stat-label">総重量</div>
          <div className="stat-value-row">
            <span className="stat-value">{totalVolume.toLocaleString()}</span>
            <span className="stat-unit">kg</span>
          </div>
          {/* 増減率は非表示 */}
        </div>

        <div className="stat-card" style={{ animationDelay: '0.2s' }}>
          <div className="stat-icon">🔥</div>
          <div className="stat-label">トレーニング継続</div>
          <div className="stat-value-row">
            <span className="stat-value">{trainingStreak}</span>
            <span className="stat-unit">日目</span>
          </div>
          <div className="stat-bonus positive">+{Math.round(trainingMultiplier * 100)}% EXP</div>
        </div>

        <div className="stat-card" style={{ animationDelay: '0.25s' }}>
          <div className="stat-icon">📅</div>
          <div className="stat-label">ログイン継続</div>
          <div className="stat-value-row">
            <span className="stat-value">{loginStreak}</span>
            <span className="stat-unit">日目</span>
          </div>
          <div className="stat-bonus positive">+{Math.round(loginMultiplier * 100)}% EXP</div>
        </div>

          <div className="stat-card" style={{ animationDelay: '0.3s' }}>
            <div className="stat-icon">🏆</div>
            <div className="stat-label">最高継続記録</div>
            <div className="stat-value-row">
              <span className="stat-value">{bestTrainingStreak}</span>
              <span className="stat-unit">日</span>
            </div>
          </div>

          {/* パートナー情報 */}
          <Link 
            to="/pet" 
            className="stat-card partner-card" 
            style={{ 
              animationDelay: '0.35s', 
              textDecoration: 'none', 
              color: 'inherit'
            }}
          >
            {activePet ? (
              <>
                <div className="stat-icon">
                  {activePet.imageUrl ? (
                    <img 
                      src={activePet.imageUrl} 
                      alt={activePet.name} 
                      style={{ width: '128px', height: '128px', objectFit: 'contain' }} 
                    />
                  ) : (
                    '🐾'
                  )}
                </div>
                <div className="stat-label">パートナー</div>
                {/* 元気度バー */}
                <div style={{ width: '70%', height: '8px', background: 'var(--border-color, rgba(0,0,0,0.1))', borderRadius: '4px', margin: '8px auto 8px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${activePet.moodScore}%`, 
                      height: '100%', 
                      background: activePet.moodScore >= 80 ? 'var(--success, #4caf50)' : activePet.moodScore >= 60 ? 'var(--info, #2196f3)' : activePet.moodScore >= 40 ? 'var(--warning, #ff9800)' : 'var(--danger, #f44336)',
                      borderRadius: '4px',
                      transition: 'width 0.5s ease'
                    }} 
                  />
                </div>
                <div className="stat-bonus positive" style={{ fontSize: '0.75rem' }}>
                  Lv.{activePet.level}
                </div>
              </>
            ) : (
              <>
                <div className="stat-icon">🥚</div>
                <div className="stat-label">パートナー</div>
                <div className="stat-value-row">
                  <span className="stat-value" style={{ fontSize: '1rem', color: 'var(--muted)' }}>未設定</span>
                </div>
                <div className="stat-bonus" style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                  見つける &rarr;
                </div>
              </>
            )}
          </Link>

        </section>

      {/* ヒートマップカレンダー */}
      <section className="card heatmap-section">
        <div className="heatmap-header">
          <h2 className="title">📅 アクティビティ</h2>
          <div className="heatmap-selectors">
            <select
              id="yearSelector"
              className="year-selector-dropdown"
              value={selectedYear}
              onChange={handleYearChange}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {/* モバイル専用：上半期/下半期セレクター（通常モバイル） */}
            {isMobile && !isExtraSmall ? (
              <select
                id="halfYearSelector"
                className="half-year-selector"
                value={currentHalf}
                onChange={handleHalfChange}
              >
                <option value="first">上半期 (1-6月)</option>
                <option value="second">下半期 (7-12月)</option>
              </select>
            ) : null}
            {/* 極小画面専用：四半期セレクター */}
            {isExtraSmall ? (
              <select
                id="quarterSelector"
                className="quarter-selector"
                value={currentQuarter}
                onChange={handleQuarterChange}
              >
                <option value={1}>Q1 (1-3月)</option>
                <option value={2}>Q2 (4-6月)</option>
                <option value={3}>Q3 (7-9月)</option>
                <option value={4}>Q4 (10-12月)</option>
              </select>
            ) : null}
          </div>
        </div>
        <p className="subtitle" id="heatmapSubtitle">
          {subtitleText}
        </p>

        {/* ヒートマップ本体 */}
        <Heatmap
          data={heatmapData}
          volumeData={volumeData}
          year={selectedYear}
          currentHalf={currentHalf}
          currentQuarter={currentQuarter}
          isMobile={isMobile}
          isExtraSmall={isExtraSmall}
          minYear={minYear}
          maxYear={maxYear}
          onPeriodChange={(year, half, quarter) => {
            setSelectedYear(year);
            setCurrentHalf(half);
            if (quarter !== undefined) setCurrentQuarter(quarter);
          }}
        />

        <div className="heatmap-legend">
          <span className="legend-label">Less</span>
          <div className="legend-cell level-0" />
          <div className="legend-cell level-1" />
          <div className="legend-cell level-2" />
          <div className="legend-cell level-3" />
          <div className="legend-cell level-4" />
          <span className="legend-label">More</span>
        </div>
      </section>



      {/* クイックアクション */}
      <section className="card card-actions">
        <h2 className="title">クイックアクション</h2>
        <div className="quick-actions">
          <Link to="/records" className="quick-action-btn">
            <img src="/images/memoicon.webp" alt="記録" className="quick-action-icon" style={{ width: 28, height: 28 }} />
            <span>トレーニング記録</span>
          </Link>
          <Link to="/gyms" className="quick-action-btn">
            <img src="/images/mapicon.webp" alt="ジム" className="quick-action-icon" style={{ width: 28, height: 28 }} />
            <span>ジム検索</span>
          </Link>
          <Link to="/exercises" className="quick-action-btn">
            <img src="/images/dumbbellicon.webp" alt="種目" className="quick-action-icon" style={{ width: 28, height: 28 }} />
            <span>種目を見る</span>
          </Link>
        </div>
      </section>

      {/* 最近の記録 + ボリューム統計 */}
      <section className="recent-section-grid">
        {/* 左カラム: 最近の記録リスト */}
        <div className="card recent-records-card">
          <h2 className="title">最近の記録</h2>
          <p className="subtitle">直近のトレーニング履歴</p>

          <div className="recent-records">
            {Array.from({ length: 7 }).map((_, index) => {
              const record = recentRecords[index];
              if (record) {
                return (
                  <div key={index} className="record-item-enhanced">
                    <div className="record-header">
                      <span className="record-date-text">
                        {new Date(record.date).toLocaleDateString('ja-JP', {
                          month: 'short',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                      </span>
                      {record.expEarned > 0 && (
                        <span className="record-exp">+{record.expEarned} EXP</span>
                      )}
                    </div>
                    <div className="record-details">
                      {record.primaryMuscles.length > 0 ? (
                        <span className="record-muscles">{record.primaryMuscles[0]}</span>
                      ) : null}
                      <span>{record.exerciseCount}種目</span>
                      <span>{record.setCount}セット</span>
                      <span>{Math.round(record.totalVolume).toLocaleString()}kg</span>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={index} className="record-item-enhanced record-item-empty">
                    <div className="record-header">
                      <span className="record-date-text" style={{ color: 'var(--muted)' }}>---</span>
                    </div>
                    <div className="record-details">
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>記録なし</span>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* 右カラム: 週間ボリューム + コンディション */}
        <div className="right-column-wrapper">
          <div className="card volume-chart-card">
            <h2 className="title">📊 週間ボリューム</h2>
            <p className="subtitle">過去7日間の推移</p>
            <VolumeBarChart data={weeklyVolumeHistory} />
          </div>

          <div className="card recovery-status-card">
            <h2 className="title">💪 コンディション</h2>
            <p className="subtitle">部位別の回復状況</p>
            <RecoveryStatusCard muscleStatuses={muscleStatuses} />
          </div>
        </div>
      </section>

      {/* デイリーリワードモーダル (developers only) */}
      {/* {isDeveloper(user?.displayName) ? (
        <DailyRewardModal
          isOpen={showDailyRewardModal}
          onClose={() => setShowDailyRewardModal(false)}
          autoClaimOnOpen={autoClaimOnOpen}
        />
      ) : null} */}
    </div>
  );
}

// ヒートマップコンポーネント（GitHub Style + スワイプ対応）
interface HeatmapProps {
  data: HeatmapData;
  volumeData: HeatmapData;
  year: number;
  currentHalf: 'first' | 'second';
  currentQuarter: 1 | 2 | 3 | 4;
  isMobile: boolean;
  isExtraSmall: boolean;
  minYear: number;
  maxYear: number;
  onPeriodChange: (year: number, half: 'first' | 'second', quarter?: 1 | 2 | 3 | 4) => void;
}

function Heatmap({
  data,
  volumeData,
  year,
  currentHalf,
  currentQuarter,
  isMobile,
  isExtraSmall,
  minYear,
  maxYear,
  onPeriodChange,
}: HeatmapProps) {
  const monthNames = useMemo(
    () => ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    []
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Tooltip state (using state instead of ref for reliable updates)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tooltipTimeoutRef = useRef<number | null>(null);

  // Swipe state refs (to avoid re-renders during drag)
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const panelWidthRef = useRef(0);
  const isAnimatingRef = useRef(false); // Flag to skip reset after swipe animation

  // volumeData ref to always access latest value in handlers
  const volumeDataRef = useRef(volumeData);
  volumeDataRef.current = volumeData;

  // Get cached heatmap data for a year
  const getCachedData = useCallback((targetYear: number): HeatmapData => {
    const cached = queryClient.getQueryData<{ heatmapData: HeatmapData }>(['heatmap', targetYear]);
    return cached?.heatmapData || {};
  }, [queryClient]);

  // Prefetch adjacent year data
  useEffect(() => {
    const prefetchYear = (targetYear: number) => {
      if (targetYear >= minYear && targetYear <= maxYear) {
        queryClient.prefetchQuery({
          queryKey: ['heatmap', targetYear],
          queryFn: () => getHeatmapData(targetYear),
        });
      }
    };

    // Prefetch based on current period
    if (isExtraSmall) {
      // For quarter view, prefetch when at Q1 or Q4
      if (currentQuarter === 1) {
        prefetchYear(year - 1);
      } else if (currentQuarter === 4) {
        prefetchYear(year + 1);
      }
    } else if (currentHalf === 'first') {
      prefetchYear(year - 1); // Previous year (for prev half = year-1/second)
    } else {
      prefetchYear(year + 1); // Next year (for next half = year+1/first)
    }
  }, [year, currentHalf, currentQuarter, isExtraSmall, queryClient, minYear, maxYear]);

  // Period navigation helpers
  const getPrevPeriod = useCallback((y: number, h: 'first' | 'second') => {
    if (h === 'second') {
      return { year: y, half: 'first' as const };
    } else {
      return { year: y - 1, half: 'second' as const };
    }
  }, []);

  const getNextPeriod = useCallback((y: number, h: 'first' | 'second') => {
    if (h === 'first') {
      return { year: y, half: 'second' as const };
    } else {
      return { year: y + 1, half: 'first' as const };
    }
  }, []);

  // Quarter navigation helpers (for extra small screens)
  const getPrevQuarter = useCallback((y: number, q: 1 | 2 | 3 | 4) => {
    if (q > 1) {
      return { year: y, quarter: (q - 1) as 1 | 2 | 3 | 4 };
    } else {
      return { year: y - 1, quarter: 4 as const };
    }
  }, []);

  const getNextQuarter = useCallback((y: number, q: 1 | 2 | 3 | 4) => {
    if (q < 4) {
      return { year: y, quarter: (q + 1) as 1 | 2 | 3 | 4 };
    } else {
      return { year: y + 1, quarter: 1 as const };
    }
  }, []);

  // Boundary checks
  const canGoPrev = useCallback(() => {
    if (isExtraSmall) {
      return !(year === minYear && currentQuarter === 1);
    }
    if (isMobile) {
      return !(year === minYear && currentHalf === 'first');
    }
    return year > minYear;
  }, [isExtraSmall, isMobile, year, currentQuarter, currentHalf, minYear]);

  const canGoNext = useCallback(() => {
    if (isExtraSmall) {
      return !(year === maxYear && currentQuarter === 4);
    }
    if (isMobile) {
      return !(year === maxYear && currentHalf === 'second');
    }
    return year < maxYear;
  }, [isExtraSmall, isMobile, year, currentQuarter, currentHalf, maxYear]);

  // Build weeks data for a given year
  const buildWeeksData = useCallback((heatmapData: HeatmapData, targetYear: number) => {
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31);

    const weeks: { date: string | null; level: number }[][] = [];
    const monthPositions: { month: number; weekIndex: number }[] = [];

    let currentWeek: { date: string | null; level: number }[] = [];
    const startDay = startDate.getDay();

    // Fill initial empty days
    for (let i = 0; i < startDay; i++) {
      currentWeek.push({ date: null, level: -1 });
    }

    let lastMonth = -1;
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = formatDateLocal(current);
      const level = heatmapData[dateStr] !== undefined ? Math.min(heatmapData[dateStr], 4) : 0;
      const month = current.getMonth();

      if (month !== lastMonth) {
        monthPositions.push({ month, weekIndex: weeks.length });
        lastMonth = month;
      }

      currentWeek.push({ date: dateStr, level });

      if (current.getDay() === 6) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      current.setDate(current.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return { weeks, monthPositions };
  }, []);

  // Filter weeks by half year
  const filterWeeksByHalf = useCallback(
    (weeks: { date: string | null; level: number }[][], half: 'first' | 'second') => {
      const filteredWeeks: { date: string | null; level: number }[][] = [];
      const filteredMonthPositions: { month: number; weekIndex: number }[] = [];
      let lastFilteredMonth = -1;

      weeks.forEach((week) => {
        let weekHasValidCell = false;
        const filteredWeek: { date: string | null; level: number }[] = [];

        week.forEach((dayData) => {
          if (!dayData || !dayData.date) {
            filteredWeek.push(dayData);
            return;
          }

          const month = parseInt(dayData.date.split('-')[1]);
          const isInRange = (half === 'first' && month <= 6) || (half === 'second' && month >= 7);

          if (isInRange) {
            filteredWeek.push(dayData);
            weekHasValidCell = true;

            if (month !== lastFilteredMonth) {
              filteredMonthPositions.push({
                month: month - 1,
                weekIndex: filteredWeeks.length,
              });
              lastFilteredMonth = month;
            }
          } else {
            filteredWeek.push({ date: null, level: -1 });
          }
        });

        if (weekHasValidCell) {
          filteredWeeks.push(filteredWeek);
        }
      });

      return { weeks: filteredWeeks, monthPositions: filteredMonthPositions };
    },
    []
  );

  // Filter weeks by quarter (for extra small screens)
  const filterWeeksByQuarter = useCallback(
    (weeks: { date: string | null; level: number }[][], quarter: 1 | 2 | 3 | 4) => {
      const filteredWeeks: { date: string | null; level: number }[][] = [];
      const filteredMonthPositions: { month: number; weekIndex: number }[] = [];
      let lastFilteredMonth = -1;

      // Quarter month ranges: Q1=1-3, Q2=4-6, Q3=7-9, Q4=10-12
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = quarter * 3;

      weeks.forEach((week) => {
        let weekHasValidCell = false;
        const filteredWeek: { date: string | null; level: number }[] = [];

        week.forEach((dayData) => {
          if (!dayData || !dayData.date) {
            filteredWeek.push(dayData);
            return;
          }

          const month = parseInt(dayData.date.split('-')[1]);
          const isInRange = month >= startMonth && month <= endMonth;

          if (isInRange) {
            filteredWeek.push(dayData);
            weekHasValidCell = true;

            if (month !== lastFilteredMonth) {
              filteredMonthPositions.push({
                month: month - 1,
                weekIndex: filteredWeeks.length,
              });
              lastFilteredMonth = month;
            }
          } else {
            filteredWeek.push({ date: null, level: -1 });
          }
        });

        if (weekHasValidCell) {
          filteredWeeks.push(filteredWeek);
        }
      });

      return { weeks: filteredWeeks, monthPositions: filteredMonthPositions };
    },
    []
  );

  // Tooltip handlers (using state for reliable updates across renders)
  // Use clientX/clientY for position: fixed (viewport-relative coordinates)
  const handleCellHover = useCallback((e: React.MouseEvent, date: string | null) => {
    if (!date) return;
    const volume = volumeDataRef.current[date] || 0;
    const volumeText = volume > 0 ? `${Math.round(volume).toLocaleString()}kg` : '休息日';

    // Simple positioning for desktop (usually enough space)
    const tooltipWidth = 160;
    const padding = 10;
    const viewportWidth = window.innerWidth;
    let x = e.clientX + padding;
    // If would overflow right, position left of cursor
    if (x + tooltipWidth > viewportWidth - padding) {
      x = e.clientX - tooltipWidth - padding;
    }

    setTooltip({
      x: x,
      y: e.clientY - 25,
      text: `${date} (${volumeText})`,
    });
  }, []);

  const handleCellMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) => {
      if (!prev) return null;
      const tooltipWidth = 160;
      const padding = 10;
      const viewportWidth = window.innerWidth;
      let x = e.clientX + padding;
      if (x + tooltipWidth > viewportWidth - padding) {
        x = e.clientX - tooltipWidth - padding;
      }
      return { ...prev, x: x, y: e.clientY - 25 };
    });
  }, []);

  const handleCellLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Calculate tooltip position that stays within viewport
  const calculateTooltipPosition = useCallback((clientX: number, clientY: number) => {
    const tooltipWidth = 160; // approximate tooltip width
    const tooltipHeight = 35; // approximate tooltip height
    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = clientX + padding;
    let y = clientY - tooltipHeight - padding;

    // If tooltip would overflow right edge, position to the left of cursor
    if (x + tooltipWidth > viewportWidth - padding) {
      x = clientX - tooltipWidth - padding;
    }
    // If still overflows (very narrow screen), align to right edge
    if (x < padding) {
      x = padding;
    }

    // If tooltip would overflow top, position below cursor
    if (y < padding) {
      y = clientY + padding + 10;
    }
    // If overflows bottom, clamp to bottom
    if (y + tooltipHeight > viewportHeight - padding) {
      y = viewportHeight - tooltipHeight - padding;
    }

    return { x, y };
  }, []);

  // Mobile tap handler for tooltip (called on touchend to distinguish from swipe)
  const handleCellTapEnd = useCallback((e: React.TouchEvent, date: string | null) => {
    // Only show tooltip if movement was small (tap, not swipe)
    const deltaX = Math.abs(currentXRef.current - startXRef.current);
    if (deltaX > 10 || !date) return;

    const touch = e.changedTouches[0];
    const volume = volumeDataRef.current[date] || 0;
    const volumeText = volume > 0 ? `${Math.round(volume).toLocaleString()}kg` : '休息日';
    const pos = calculateTooltipPosition(touch.clientX, touch.clientY);
    setTooltip({
      x: pos.x,
      y: pos.y,
      text: `${date} (${volumeText})`,
    });

    // Auto-hide after 1.5 seconds
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setTooltip(null);
    }, 1500);
  }, [calculateTooltipPosition]);

  // Render a single heatmap panel (no memoization to ensure fresh handlers)
  const renderPanel = (
    targetYear: number,
    half: 'first' | 'second' | 'full',
    panelData: HeatmapData,
    quarter?: 1 | 2 | 3 | 4
  ) => {
    const { weeks: allWeeks, monthPositions: allMonthPositions } = buildWeeksData(panelData, targetYear);

    let weeks: { date: string | null; level: number }[][];
    let monthPositions: { month: number; weekIndex: number }[];

    if (half === 'full') {
      weeks = allWeeks;
      monthPositions = allMonthPositions;
    } else if (quarter !== undefined) {
      // Quarter filtering for extra small screens
      const filtered = filterWeeksByQuarter(allWeeks, quarter);
      weeks = filtered.weeks;
      monthPositions = filtered.monthPositions;
    } else {
      const filtered = filterWeeksByHalf(allWeeks, half);
      weeks = filtered.weeks;
      monthPositions = filtered.monthPositions;
    }

    const panelKey = quarter !== undefined ? `${targetYear}-q${quarter}` : `${targetYear}-${half}`;

    if (weeks.length === 0) {
      return (
        <div className="heatmap-panel" data-year={targetYear} data-half={half} key={panelKey}>
          <div className="heatmap-wrapper">
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px' }}>
              データがありません
            </p>
          </div>
        </div>
      );
    }

    const weekWidth = 100 / weeks.length;

    return (
      <div className="heatmap-panel" data-year={targetYear} data-half={half} key={panelKey}>
        <div className="heatmap-wrapper">
          {/* Month labels */}
          <div className="heatmap-months">
            {monthPositions.map((pos, idx) => (
              <span
                key={idx}
                className="month-label"
                style={{ left: `${pos.weekIndex * weekWidth}%` }}
              >
                {monthNames[pos.month]}
              </span>
            ))}
          </div>

          <div className="heatmap-body">
            {/* Weekday labels */}
            <div className="heatmap-weekdays">
              <div className="weekday-label"></div>
              <div className="weekday-label">月</div>
              <div className="weekday-label"></div>
              <div className="weekday-label">水</div>
              <div className="weekday-label"></div>
              <div className="weekday-label">金</div>
              <div className="weekday-label"></div>
            </div>

            {/* Heatmap grid */}
            <div
              className="heatmap-grid"
              style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}
            >
              {weeks.map((week, weekIdx) =>
                week.map((day, dayIdx) => (
                  <div
                    key={`${weekIdx}-${dayIdx}`}
                    className={`heatmap-cell ${day.level >= 0 ? `level-${day.level}` : 'empty'}`}
                    data-date={day.date || undefined}
                    onMouseOver={(e) => handleCellHover(e, day.date)}
                    onMouseMove={(e) => handleCellMouseMove(e)}
                    onMouseOut={handleCellLeave}
                    onTouchEnd={(e) => handleCellTapEnd(e, day.date)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Swipe handlers (mobile only)
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isMobile || !viewportRef.current || !trackRef.current) return;

    // Don't start drag on buttons/links
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' || target.tagName === 'BUTTON') return;

    isDraggingRef.current = true;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = startXRef.current;
    panelWidthRef.current = viewportRef.current.offsetWidth;

    trackRef.current.classList.add('dragging');
    viewportRef.current.style.cursor = 'grabbing';
  }, [isMobile]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current || !isMobile || !trackRef.current) return;

    e.preventDefault();
    currentXRef.current = e.touches[0].clientX;
    const deltaX = currentXRef.current - startXRef.current;

    const atStart = !canGoPrev();
    const atEnd = !canGoNext();

    let adjustedDelta = deltaX;

    // Rubber band effect at boundaries
    if ((atStart && deltaX > 0) || (atEnd && deltaX < 0)) {
      adjustedDelta = deltaX / 4;
    }

    const baseOffset = -panelWidthRef.current;
    trackRef.current.style.transform = `translateX(${baseOffset + adjustedDelta}px)`;
  }, [isMobile, canGoPrev, canGoNext]);

  const snapToCenter = useCallback(() => {
    if (!trackRef.current) return;
    trackRef.current.style.transform = `translateX(-${panelWidthRef.current}px)`;
  }, []);

  const goToNextPeriod = useCallback(() => {
    if (!trackRef.current) return;

    isAnimatingRef.current = true;

    // Animate to next panel
    trackRef.current.style.transform = `translateX(-${panelWidthRef.current * 2}px)`;

    // Wait for animation, then update state
    setTimeout(() => {
      if (isExtraSmall) {
        const next = getNextQuarter(year, currentQuarter);
        // Convert quarter to half for compatibility
        const half = next.quarter <= 2 ? 'first' : 'second';
        onPeriodChange(next.year, half as 'first' | 'second', next.quarter);
      } else {
        const next = getNextPeriod(year, currentHalf);
        onPeriodChange(next.year, next.half);
      }
    }, 300);
  }, [year, currentHalf, currentQuarter, isExtraSmall, getNextPeriod, getNextQuarter, onPeriodChange]);

  const goToPrevPeriod = useCallback(() => {
    if (!trackRef.current) return;

    isAnimatingRef.current = true;

    // Animate to prev panel
    trackRef.current.style.transform = 'translateX(0)';

    // Wait for animation, then update state
    setTimeout(() => {
      if (isExtraSmall) {
        const prev = getPrevQuarter(year, currentQuarter);
        // Convert quarter to half for compatibility
        const half = prev.quarter <= 2 ? 'first' : 'second';
        onPeriodChange(prev.year, half as 'first' | 'second', prev.quarter);
      } else {
        const prev = getPrevPeriod(year, currentHalf);
        onPeriodChange(prev.year, prev.half);
      }
    }, 300);
  }, [year, currentHalf, currentQuarter, isExtraSmall, getPrevPeriod, getPrevQuarter, onPeriodChange]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current || !isMobile || !trackRef.current || !viewportRef.current) return;

    isDraggingRef.current = false;
    trackRef.current.classList.remove('dragging');
    viewportRef.current.style.cursor = 'grab';

    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - startXRef.current;
    const threshold = panelWidthRef.current * SWIPE_THRESHOLD;

    if (deltaX < -threshold && canGoNext()) {
      // Swipe left -> go to next period
      goToNextPeriod();
    } else if (deltaX > threshold && canGoPrev()) {
      // Swipe right -> go to prev period
      goToPrevPeriod();
    } else {
      // Snap back to center
      snapToCenter();
    }
  }, [isMobile, canGoPrev, canGoNext, goToNextPeriod, goToPrevPeriod, snapToCenter]);

  // Attach touch event listeners
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isMobile) return;

    viewport.addEventListener('touchstart', handleTouchStart, { passive: true });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd);

    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Update transform when period changes (mobile)
  useEffect(() => {
    if (!isMobile || !trackRef.current || !viewportRef.current) return;

    panelWidthRef.current = viewportRef.current.offsetWidth;

    // Disable transition, set position, then restore transition
    const track = trackRef.current;
    track.style.transition = 'none';
    track.style.transform = `translateX(-${panelWidthRef.current}px)`;

    // Use double requestAnimationFrame to ensure the browser has painted
    // before restoring the transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (track) {
          track.style.transition = '';
        }
        // Clear the animating flag after position reset
        isAnimatingRef.current = false;
      });
    });
  }, [isMobile, year, currentHalf]);

  const handlePanelResize = useCallback(() => {
    if (!viewportRef.current || !trackRef.current) return;
    panelWidthRef.current = viewportRef.current.offsetWidth;

    const track = trackRef.current;
    track.style.transition = 'none';

    if (isMobile) {
      // モバイル: 3パネル構成の中央パネルを表示
      track.style.transform = `translateX(-${panelWidthRef.current}px)`;
    } else {
      // PC: transformをリセット
      track.style.transform = 'none';
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (track) {
          track.style.transition = '';
        }
      });
    });
  }, [isMobile]);

  // Handle resize
  useWindowEventListener('resize', handlePanelResize);

  // isMobile変更時にもtransformを更新（全画面ボタン対応）
  useEffect(() => {
    if (!viewportRef.current || !trackRef.current) return;
    panelWidthRef.current = viewportRef.current.offsetWidth;

    const track = trackRef.current;
    track.style.transition = 'none';

    if (isMobile) {
      track.style.transform = `translateX(-${panelWidthRef.current}px)`;
    } else {
      track.style.transform = 'none';
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (track) {
          track.style.transition = '';
        }
      });
    });
  }, [isMobile]);

  // Render panels (no memoization to ensure fresh handlers on every render)
  const renderPanels = () => {
    if (isExtraSmall) {
      // 3-panel structure for extra small: prev quarter | current quarter | next quarter
      const prevQ = getPrevQuarter(year, currentQuarter);
      const nextQ = getNextQuarter(year, currentQuarter);

      const prevData = getCachedData(prevQ.year);
      const currentData = data;
      const nextData = getCachedData(nextQ.year);

      // Use 'first' or 'second' based on quarter for half parameter (not used when quarter is set)
      const prevHalf = prevQ.quarter <= 2 ? 'first' : 'second';
      const currHalf = currentQuarter <= 2 ? 'first' : 'second';
      const nextHalf = nextQ.quarter <= 2 ? 'first' : 'second';

      return (
        <>
          {renderPanel(prevQ.year, prevHalf as 'first' | 'second', prevData, prevQ.quarter)}
          {renderPanel(year, currHalf as 'first' | 'second', currentData, currentQuarter)}
          {renderPanel(nextQ.year, nextHalf as 'first' | 'second', nextData, nextQ.quarter)}
        </>
      );
    } else if (isMobile) {
      // 3-panel structure for mobile: prev | current | next
      const prevPeriod = getPrevPeriod(year, currentHalf);
      const nextPeriod = getNextPeriod(year, currentHalf);

      const prevData = getCachedData(prevPeriod.year);
      const currentData = data;
      const nextData = getCachedData(nextPeriod.year);

      return (
        <>
          {renderPanel(prevPeriod.year, prevPeriod.half, prevData)}
          {renderPanel(year, currentHalf, currentData)}
          {renderPanel(nextPeriod.year, nextPeriod.half, nextData)}
        </>
      );
    } else {
      // Single panel for PC: full year
      return renderPanel(year, 'full', data);
    }
  };

  return (
    <>
      <div className="heatmap-viewport" ref={viewportRef}>
        <div className="heatmap-track" ref={trackRef}>
          {renderPanels()}
        </div>
      </div>

      {/* Tooltip rendered via Portal to document.body */}
      {tooltip && createPortal(
        <div
          className="heatmap-tooltip"
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          {tooltip.text}
        </div>,
        document.body
      )}
    </>
  );
}

// 週間ボリュームミニグラフコンポーネント
function VolumeBarChart({ data }: { data: DailyVolume[] }) {
  if (data.length === 0) {
    return (
      <div className="volume-bar-chart">
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 60 }}>
          データがありません
        </p>
      </div>
    );
  }

  const maxVolume = Math.max(...data.map(d => d.volume), 1);

  return (
    <div className="volume-bar-chart">
      {data.map((day, i) => (
        <div key={i} className="bar-container">
          <div
            className="bar"
            style={{ height: `${(day.volume / maxVolume) * 100}%` }}
            title={`${Math.round(day.volume).toLocaleString()}kg`}
          />
          <span className="bar-label">
            {new Date(day.date).toLocaleDateString('ja-JP', { weekday: 'short' })}
          </span>
        </div>
      ))}
    </div>
  );
}

// 部位別コンディションカードコンポーネント
function RecoveryStatusCard({ muscleStatuses }: { muscleStatuses: MuscleStatus[] }) {
  // 「今日のおすすめ」を算出（readyの中で最も経過日数が多いもの）
  const recommendedMuscle = muscleStatuses
    .filter(m => m.status === 'ready' || m.status === 'stale')
    .sort((a, b) => b.daysSinceLastTrained - a.daysSinceLastTrained)[0];

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'recovering': return '🔴';
      case 'ready': return '🟢';
      case 'stale': return '🟡';
      default: return '⚪';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'recovering': return '回復中';
      case 'ready': return '準備OK';
      case 'stale': return 'ご無沙汰';
      default: return '不明';
    }
  };

  return (
    <div className="recovery-status-content">
      {/* 今日のおすすめ */}
      {recommendedMuscle ? (
        <div className="recommendation-banner">
          <span className="recommendation-icon">🔥</span>
          <span className="recommendation-text">
            今日は <strong>{recommendedMuscle.muscleName}</strong> の日！
            <span className="recommendation-days">（{recommendedMuscle.daysSinceLastTrained}日経過）</span>
          </span>
        </div>
      ) : null}

      {/* 部位リスト */}
      <div className="muscle-status-list">
        {muscleStatuses.map((muscle, i) => (
          <div key={i} className={`muscle-status-item status-${muscle.status}`}>
            <span className="muscle-name">
              {getStatusEmoji(muscle.status)} {muscle.muscleName}
            </span>
            <span className="muscle-days">
              {muscle.lastTrained ? `${muscle.daysSinceLastTrained}日前` : '---'}
            </span>
            <span className={`muscle-badge badge-${muscle.status}`}>
              {getStatusLabel(muscle.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
