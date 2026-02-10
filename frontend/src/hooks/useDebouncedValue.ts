import { useState, useEffect } from 'react';

/**
 * 値をデバウンスするカスタムフック
 * @param value - デバウンス対象の値
 * @param delay - デバウンス遅延時間（ミリ秒）
 * @returns デバウンスされた値
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
