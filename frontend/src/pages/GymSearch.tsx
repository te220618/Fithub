import { useState, useEffect, lazy, Suspense } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { searchGymsPaged, getGymTags } from '../services/gymApi';
import type { GymFilter } from '../types';
import { useInfiniteScroll, useDebouncedValue } from '../hooks';
import '../styles/gym_search.css';

// 地図コンポーネントを遅延ロード（コスト節約）
const GymMap = lazy(() => import('../components/GymMap'));

const AREAS = ['青葉区', '宮城野区', '若林区', '太白区', '泉区'];

export default function GymSearch() {
  const [searchInput, setSearchInput] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState<number>(15000);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // デバウンス処理（テキスト入力: 400ms、スライダー: 300ms）
  const debouncedSearchInput = useDebouncedValue(searchInput, 400);
  const debouncedMaxPrice = useDebouncedValue(maxPrice, 300);

  // Filter state for API
  const [filter, setFilter] = useState<GymFilter>({});

  // タグ一覧を動的に取得
  const { data: tagsData } = useQuery({
    queryKey: ['gymTags'],
    queryFn: getGymTags,
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
  });
  const tags = Array.isArray(tagsData) ? tagsData.map((t) => t.name) : [];

  // Gym search (infinite scroll)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ['gyms', filter],
    queryFn: ({ pageParam = 0 }) => searchGymsPaged(pageParam, 12, filter),
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.last) return undefined;
      return lastPage.number + 1;
    },
    initialPageParam: 0,
  });

  // Update filter when search params change (デバウンス適用済みの値を使用)
  useEffect(() => {
    setFilter({
      keyword: debouncedSearchInput || undefined,
      areas: selectedAreas.length > 0 ? selectedAreas : undefined,
      maxFee: debouncedMaxPrice,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
    });
  }, [debouncedSearchInput, selectedAreas, debouncedMaxPrice, selectedTags]);

  // 無限スクロール用カスタムフック
  const loadMoreRef = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetching: isFetchingNextPage,
  });

  // Flatten all gyms
  const gyms = data?.pages.flatMap((page) => page.content) || [];
  const totalCount = data?.pages[0]?.totalElements || 0;

  // Toggle area selection (Single select like HTML chips?)
  // Looking at HTML, it's actually multiple in hidden fields but chips seem to behave as toggle/multi
  const toggleArea = (area: string) => {
    if (selectedAreas.includes(area)) {
      setSelectedAreas(selectedAreas.filter((a) => a !== area));
    } else {
      setSelectedAreas([...selectedAreas, area]);
    }
  };

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  // Reset all filters
  const handleReset = () => {
    setSearchInput('');
    setSelectedAreas([]);
    setSelectedTags([]);
    setMaxPrice(15000);
    setFilter({});
  };

  return (
    <div className="container">
      {/* Search Card */}
      <section className="search-card">
        <div className="title-row">
          <div>
            <h2 className="title">仙台市内のジム検索</h2>
            <p className="subtitle">仙台市内にあるジムを条件で絞り込んで検索できます</p>
          </div>
          <div className="title-buttons">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
            >
              {viewMode === 'list' ? '🗺️ 地図で表示' : '📋 リストで表示'}
            </button>
            <button type="button" className="reset-btn" id="resetBtn" onClick={handleReset}>
              リセット
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="searchbar">
          <img src="/images/searchicon.webp" alt="検索アイコン" className="search-icon" />
          <input
            type="text"
            id="searchInput"
            placeholder="ジム名や住所で検索..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput ? (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchInput('')}
            >
              ×
            </button>
          ) : null}
        </div>

        {/* Area filter */}
        <div className="label" style={{ marginTop: 16 }}>エリア</div>
        <div className="chips" id="areaChips">
          <button
            className={`chip${selectedAreas.length === 0 ? ' active' : ''}`}
            onClick={() => setSelectedAreas([])}
          >
            すべて
          </button>
          {AREAS.map((area) => (
            <button
              key={area}
              className={`chip${selectedAreas.includes(area) ? ' active' : ''}`}
              onClick={() => toggleArea(area)}
            >
              {area}
            </button>
          ))}
        </div>

        {/* Price filter (Aligned with HTML range-wrapper) */}
        <div className="range-wrapper">
          <div className="range-label-wrapper">
            <div className="label">月額料金上限</div>
            <span className="range-value" id="priceValue">
              ¥{maxPrice.toLocaleString()}
            </span>
          </div>
          <div className="range-container">
            <div className="range-track"></div>
            <div
              className="range-progress"
              id="rangeProgress"
              style={{ width: `${(maxPrice / 15000) * 100}%` }}
            ></div>
            <input
              className="range"
              type="range"
              id="priceRange"
              min="0"
              max="15000"
              step="500"
              value={maxPrice}
              onChange={(e) => setMaxPrice(parseInt(e.target.value))}
            />
          </div>
          <div className="price-input-wrapper">
            <input
              type="number"
              className="price-input"
              id="priceInput"
              min="0"
              max="15000"
              step="500"
              placeholder="金額を入力"
              value={maxPrice}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) setMaxPrice(Math.min(15000, val));
              }}
            />
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>円</span>
          </div>
        </div>

        {/* Tag filter */}
        <div className="label">設備・施設</div>
        <div className="chips" id="tagChips">
          <button
            className={`chip${selectedTags.length === 0 ? ' active' : ''}`}
            onClick={() => setSelectedTags([])}
          >
            すべて
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              className={`chip${selectedTags.includes(tag) ? ' active' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div id="resultCount" className="result-count">
          {totalCount}件のジムが見つかりました
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
        <div className="empty-state">
          <p style={{ color: '#f87171' }}>エラーが発生しました: {(error as Error)?.message || '不明なエラー'}</p>
        </div>
      ) : null}

      {/* Map View */}
      {viewMode === 'map' && !isLoading && !isError ? (
        <Suspense
          fallback={
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <div className="loading-spinner" />
            </div>
          }
        >
          <GymMap gyms={gyms} selectedTags={selectedTags} />
        </Suspense>
      ) : null}

      {/* Gym Grid (Aligned with HTML grid) */}
      {viewMode === 'list' ? (
        <section id="gymGrid" className="grid">
          {gyms.map((gym) => (
            <article key={gym.id} className="gym-card">
              <h3>{gym.name}</h3>
              <div className="row">
                <img src="/images/mapicon.webp" alt="マップアイコン" className="row-icon" />
                <span>{gym.address}</span>
              </div>
              {gym.openTime || gym.closeTime ? (
                <div className="row">
                  <img src="/images/watchicon.webp" alt="時計アイコン" className="row-icon" />
                  <span>{gym.openTime} - {gym.closeTime}</span>
                </div>
              ) : null}
              {gym.phone ? (
                <div className="row">
                  <img src="/images/phoneicon.webp" alt="電話アイコン" className="row-icon" />
                  <span>{gym.phone}</span>
                </div>
              ) : null}
              <div className="kv">
                <div className="item">
                  <img src="/images/walleticon.webp" alt="財布アイコン" className="row-icon" />
                  <span>月額 ¥{(gym.monthlyFee ?? 0).toLocaleString()}</span>
                </div>
              </div>
              {gym.tags && gym.tags.length > 0 ? (
                <div className="footer-chips">
                  {gym.tags.map((tag, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`footer-chip${selectedTags.includes(tag) ? ' active' : ''}`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {/* Empty state */}
      {!isLoading && gyms.length === 0 ? (
        <div className="empty-state">
          <img src="/images/mapicon.webp" alt="ジムなし" style={{ width: 48, opacity: 0.5 }} />
          <p>ジムが見つかりませんでした</p>
        </div>
      ) : null}

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} style={{ padding: '16px 0', display: 'flex', justifyContent: 'center' }}>
        {isFetchingNextPage ? <div className="loading-spinner" /> : null}
      </div>
    </div>
  );
}
