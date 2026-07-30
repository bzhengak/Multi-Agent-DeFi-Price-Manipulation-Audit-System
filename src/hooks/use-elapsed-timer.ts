'use client';

import { useState, useEffect, useRef } from 'react';

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}分${s < 10 ? '0' : ''}${s}秒`;
  return `${s}秒`;
}

export function useElapsedTimer(isRunning: boolean): string {
  const startRef = useRef<number>(Date.now());
  const [display, setDisplay] = useState('0秒');

  useEffect(() => {
    if (!isRunning) {
      const sec = Math.floor((Date.now() - startRef.current) / 1000);
      setDisplay(formatElapsed(sec));
      return;
    }
    startRef.current = Date.now();
    setDisplay('0秒');
    const h = setInterval(() => {
      const sec = Math.floor((Date.now() - startRef.current) / 1000);
      setDisplay(formatElapsed(sec));
    }, 1000);
    return () => clearInterval(h);
  }, [isRunning]);

  return display;
}
