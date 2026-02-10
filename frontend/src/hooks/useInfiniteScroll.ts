import { useEffect, useRef, type RefObject } from 'react';

interface UseInfiniteScrollOptions {
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetching: boolean;
  threshold?: number;
  rootMargin?: string;
}

/**
 * 無限スクロール用のカスタムフック
 * IntersectionObserverを使用してスクロール検知を行う
 */
export function useInfiniteScroll<T extends HTMLElement = HTMLDivElement>({
  fetchNextPage,
  hasNextPage,
  isFetching,
  threshold = 0.1,
  rootMargin = '100px',
}: UseInfiniteScrollOptions): RefObject<T | null> {
  const loadMoreRef = useRef<T>(null);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetching) {
          fetchNextPage();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasNextPage, isFetching, threshold, rootMargin]);

  return loadMoreRef;
}
