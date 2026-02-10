import { useState, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getExercisesPaged, getTargetMuscles } from '../services/exerciseApi';
import { getMuscleGroups } from '../services/workoutApi';
import type { Exercise, ExerciseFilter } from '../types';
import { useInfiniteScroll, useEscapeKey } from '../hooks';
import '../styles/exercises.css';

export default function Exercises() {
  const [filter, setFilter] = useState<ExerciseFilter>({});
  const [selectedMuscle, setSelectedMuscle] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedTargetMuscles, setSelectedTargetMuscles] = useState<string[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  // Get muscle groups
  const { data: rawMuscleGroups } = useQuery({
    queryKey: ['muscleGroups'],
    queryFn: getMuscleGroups,
  });

  // Get target muscles
  const { data: rawTargetMuscles } = useQuery({
    queryKey: ['targetMuscles'],
    queryFn: getTargetMuscles,
  });

  const muscleGroups = Array.isArray(rawMuscleGroups) ? rawMuscleGroups : [];
  const targetMuscles = Array.isArray(rawTargetMuscles) ? rawTargetMuscles : [];

  // Get exercises (infinite scroll)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ['exercises', filter],
    queryFn: ({ pageParam = 0 }) => getExercisesPaged(pageParam, 12, filter),
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.last) return undefined;
      return lastPage.number + 1;
    },
    initialPageParam: 0,
  });

  // 無限スクロール用カスタムフック
  const loadMoreRef = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetching: isFetchingNextPage,
  });

  // ESCキーでモーダルを閉じる
  useEscapeKey(() => setSelectedExercise(null), selectedExercise !== null);

  // Flatten all exercises
  const exercises = data?.pages.flatMap((page) => page.content) || [];
  const totalCount = data?.pages[0]?.totalElements || 0;

  // Handle muscle filter
  const handleMuscleFilter = (muscle: string) => {
    setSelectedMuscle(muscle);
    if (muscle === 'all') {
      setFilter({ ...filter, muscleGroupId: undefined });
    } else {
      const mg = muscleGroups.find((m) => m.name === muscle || m.displayName === muscle);
      if (mg) {
        setFilter({ ...filter, muscleGroupId: mg.id });
      }
    }
  };

  // Handle difficulty filter
  const handleDifficultyFilter = (difficulty: string) => {
    setSelectedDifficulty(difficulty);
    if (difficulty === 'all') {
      setFilter({ ...filter, difficulty: undefined });
    } else {
      const difficultyMap: Record<string, number> = {
        '初級': 1,
        '中級': 2,
        '上級': 3,
      };
      setFilter({ ...filter, difficulty: difficultyMap[difficulty] });
    }
  };

  // Handle target muscle filter (toggle multiple selection)
  const handleTargetMuscleFilter = (targetMuscle: string) => {
    if (targetMuscle === 'all') {
      // 「すべて」を選択したらクリア
      setSelectedTargetMuscles([]);
      setFilter({ ...filter, targetMuscles: undefined });
    } else {
      // トグル動作：既に選択されていたら解除、なければ追加
      const newSelection = selectedTargetMuscles.includes(targetMuscle)
        ? selectedTargetMuscles.filter(tm => tm !== targetMuscle)
        : [...selectedTargetMuscles, targetMuscle];

      setSelectedTargetMuscles(newSelection);
      setFilter({
        ...filter,
        targetMuscles: newSelection.length > 0 ? newSelection : undefined
      });
    }
  };

  // Get difficulty badge class
  const getDifficultyClass = (difficulty: number) => {
    if (difficulty === 1) return 'difficulty-beginner';
    if (difficulty === 2) return 'difficulty-intermediate';
    return 'difficulty-advanced';
  };

  const getDifficultyLabel = (difficulty: number) => {
    if (difficulty === 1) return '初級';
    if (difficulty === 2) return '中級';
    return '上級';
  };

  return (
    <div className="container">
      {/* Filter Card */}
      <section className="card">
        <h2 className="title">筋トレ種目紹介</h2>
        <p className="subtitle">部位別のトレーニング種目一覧</p>

        {/* Muscle filters */}
        <div className="label">部位</div>
        <div className="filters">
          <button
            className={`filter${selectedMuscle === 'all' ? ' active' : ''}`}
            onClick={() => handleMuscleFilter('all')}
          >
            すべて
          </button>
          {muscleGroups.map((muscle) => (
            <button
              key={muscle.id}
              className={`filter${selectedMuscle === muscle.displayName ? ' active' : ''}`}
              onClick={() => handleMuscleFilter(muscle.displayName)}
            >
              {muscle.displayName}
            </button>
          ))}
        </div>

        {/* Difficulty filters */}
        <div className="label" style={{ marginTop: 16 }}>難易度</div>
        <div className="filters">
          <button
            className={`filter${selectedDifficulty === 'all' ? ' active' : ''}`}
            onClick={() => handleDifficultyFilter('all')}
          >
            すべて
          </button>
          {['初級', '中級', '上級'].map((diff) => (
            <button
              key={diff}
              className={`filter${selectedDifficulty === diff ? ' active' : ''}`}
              onClick={() => handleDifficultyFilter(diff)}
            >
              {diff}
            </button>
          ))}
        </div>

        {/* Target muscle filters (multiple selection) */}
        <div className="label" style={{ marginTop: 16 }}>ターゲット筋肉</div>
        <div className="filters">
          <button
            className={`filter${selectedTargetMuscles.length === 0 ? ' active' : ''}`}
            onClick={() => handleTargetMuscleFilter('all')}
          >
            すべて
          </button>
          {targetMuscles.map((tm) => (
            <button
              key={tm}
              className={`filter${selectedTargetMuscles.includes(tm) ? ' active' : ''}`}
              onClick={() => handleTargetMuscleFilter(tm)}
            >
              {tm}
            </button>
          ))}
        </div>

        <div id="resultCount" className="result-count">
          {totalCount}件の種目が見つかりました
        </div>
      </section>

      {/* Loading */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div className="loading-spinner" />
        </div>
      ) : null}

      {/* Error state */}
      {isError ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#f87171' }}>
          エラーが発生しました: {(error as Error)?.message || '不明なエラー'}
        </div>
      ) : null}

      {/* Exercise Grid */}
      <section id="exerciseGrid" className="grid">
        {exercises.map((exercise) => (
          <article
            key={exercise.id}
            className={`exercise${exercise.videoPath ? ' has-video' : ''}`}
            onClick={exercise.videoPath ? () => setSelectedExercise(exercise) : undefined}
          >
            <h3>{exercise.name}</h3>
            <div className="badges">
              <span
                className={`badge clickable${selectedMuscle === exercise.muscleGroups?.[0]?.displayName ? ' selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const muscleName = exercise.muscleGroups?.[0]?.displayName;
                  if (muscleName) handleMuscleFilter(muscleName);
                }}
              >
                {exercise.muscleGroups?.[0]?.displayName || '未分類'}
              </span>
              <span
                className={`badge clickable ${getDifficultyClass(exercise.difficulty)}${selectedDifficulty === getDifficultyLabel(exercise.difficulty) ? ' selected' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDifficultyFilter(getDifficultyLabel(exercise.difficulty));
                }}
              >
                {getDifficultyLabel(exercise.difficulty)}
              </span>
            </div>
            {exercise.description ? (
              <p className="subtitle">{exercise.description}</p>
            ) : null}
            <div className="row">ターゲット筋肉:</div>
            <div className="chips">
              {exercise.targetMuscles?.map((tm) => (
                <span
                  key={tm.id}
                  className={`chip clickable${selectedTargetMuscles.includes(tm.name) ? ' selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTargetMuscleFilter(tm.name);
                  }}
                >
                  {tm.name}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} style={{ padding: '16px 0', display: 'flex', justifyContent: 'center' }}>
        {isFetchingNextPage ? <div className="loading-spinner" /> : null}
      </div>

      {/* Video Modal */}
      {selectedExercise ? (
        <VideoModal
          exercise={selectedExercise}
          onClose={() => setSelectedExercise(null)}
        />
      ) : null}
    </div>
  );
}

// Video Modal Component
function VideoModal({
  exercise,
  onClose,
}: {
  exercise: Exercise;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setCurrentTime(duration);
    setIsPlaying(false);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="video-modal show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="video-modal-content">
        <div className="video-modal-header">
          <h3 className="video-modal-title">{exercise.name}</h3>
          <button className="video-modal-close" onClick={onClose}>&times;</button>
        </div>

        {exercise.videoPath ? (
          <>
              <video
                ref={videoRef}
                className="video-player"
                src={exercise.videoPath}
                autoPlay
                muted
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
              />
            <div className="video-controls">
              <button className="video-btn" onClick={togglePlay}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <input
                type="range"
                id="videoSeekBar"
                min={0}
                max={duration || 0}
                step={0.01}
                value={currentTime}
                onChange={handleSeek}
              />
              <div className="video-time-display">
                <span>{formatTime(currentTime)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            動画がありません
          </div>
        )}
      </div>
    </div>
  );
}
