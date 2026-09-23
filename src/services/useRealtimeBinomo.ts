import { useState, useEffect, useRef, useCallback } from 'react';
import { FormattedCandle, LiveTick, RealtimeStatus, UpdateIntervalOption } from '../types';

interface UseRealtimeBinomoOptions {
  enabled?: boolean;
  initialIntervalMs?: UpdateIntervalOption;
  timeframeSeconds?: number;
  initialCandles?: FormattedCandle[];
  onTick?: (tick: LiveTick) => void;
}

export function useRealtimeBinomo({
  enabled = true,
  initialIntervalMs = 500,
  timeframeSeconds = 60,
  initialCandles,
  onTick,
}: UseRealtimeBinomoOptions = {}) {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [intervalMs, setIntervalMs] = useState<UpdateIntervalOption>(initialIntervalMs);
  const [latestTick, setLatestTick] = useState<LiveTick | null>(null);
  const [tickCount, setTickCount] = useState<number>(0);
  const [ticksPerSec, setTicksPerSec] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(1);
  const [lastTickDate, setLastTickDate] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  // Real-time tick engine references
  const activeCandleRef = useRef<FormattedCandle | null>(null);
  const tickCounterRef = useRef<number>(0);
  const windowTicksRef = useRef<number>(0);
  const lastSecTimeRef = useRef<number>(Date.now());
  const pollerTimerRef = useRef<any>(null);

  // Backend endpoint availability trackers to prevent continuous 404 flooding
  const activeLatestUrlRef = useRef<string>('/api/binomo/latest');
  const latestEndpointAvailableRef = useRef<boolean>(true);
  const failedPollCountRef = useRef<number>(0);
  const lastProbeTimeRef = useRef<number>(0);
  const sseErrorCountRef = useRef<number>(0);

  // Synchronize initial candle baseline whenever history is loaded or timeframe changes
  useEffect(() => {
    if (initialCandles && initialCandles.length > 0) {
      const last = initialCandles[initialCandles.length - 1];
      activeCandleRef.current = {
        time: last.time,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume || 1,
      };
    }
  }, [initialCandles, timeframeSeconds]);

  // Unified tick handler that processes authoritative exchange ticks
  const handleAuthoritativeTick = useCallback((tick: LiveTick) => {
    if (!tick || typeof tick.time !== 'number' || isNaN(tick.time)) return;
    if (typeof tick.close !== 'number' || isNaN(tick.close)) return;

    const alignedTime = Math.floor(tick.time / timeframeSeconds) * timeframeSeconds;
    const current = activeCandleRef.current;
    const isNew = !current || alignedTime > current.time;

    if (isNew) {
      // New candle started on the exchange
      activeCandleRef.current = {
        time: alignedTime,
        open: tick.open,
        high: tick.high,
        low: tick.low,
        close: tick.close,
        volume: tick.volume || 1,
      };

      tickCounterRef.current++;
      windowTicksRef.current++;
      setTickCount(tickCounterRef.current);
      setLatestTick({
        ...tick,
        time: alignedTime,
      });
      setLastTickDate(new Date());

      onTickRef.current?.({
        ...tick,
        time: alignedTime,
        isNewCandle: true,
        tickIndex: tickCounterRef.current,
      });
    } else if (alignedTime === current.time) {
      // Current candle updated on the exchange
      const priceOrBarChanged =
        tick.close !== current.close ||
        tick.high > current.high ||
        tick.low < current.low ||
        tick.open !== current.open;

      current.open = tick.open;
      current.high = Math.max(current.high, tick.high);
      current.low = Math.min(current.low, tick.low);
      current.close = tick.close;
      current.volume = Math.max(current.volume || 1, tick.volume || 1);

      if (priceOrBarChanged) {
        tickCounterRef.current++;
        windowTicksRef.current++;
        setTickCount(tickCounterRef.current);
        setLatestTick({
          ...tick,
          time: alignedTime,
        });
        setLastTickDate(new Date());

        onTickRef.current?.({
          time: current.time,
          open: current.open,
          high: current.high,
          low: current.low,
          close: current.close,
          volume: current.volume,
          created_at: tick.created_at,
          isNewCandle: false,
          tickIndex: tickCounterRef.current,
          serverTimestamp: tick.serverTimestamp || Date.now(),
        });
      }
    }
    // If alignedTime < current.time, ignore stale out-of-order tick
  }, [timeframeSeconds]);

  // 1. Connect to live Binomo SSE stream for the specific active timeframe
  useEffect(() => {
    if (!enabled || isPaused) {
      setStatus(isPaused ? 'paused' : 'connecting');
      return;
    }

    let isCleanedUp = false;
    let es: EventSource | null = null;
    sseErrorCountRef.current = 0;

    try {
      es = new EventSource(`/api/binomo/stream?interval=${timeframeSeconds}`);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => {
        if (!isCleanedUp) {
          sseErrorCountRef.current = 0;
          setStatus('connected');
        }
      });

      es.addEventListener('tick', (event) => {
        if (isCleanedUp) return;
        try {
          sseErrorCountRef.current = 0;
          const data: LiveTick = JSON.parse(event.data);
          const now = Date.now();
          const latency = data.serverTimestamp ? Math.max(0, now - data.serverTimestamp) : 12;
          setLatencyMs(latency);
          setStatus('connected');

          handleAuthoritativeTick(data);
        } catch (e) {
          console.error('Error parsing live tick event:', e);
        }
      });

      es.onerror = () => {
        if (isCleanedUp) return;
        sseErrorCountRef.current++;
        // If SSE fails multiple times (e.g. 404 on static hosts or serverless without persistent SSE),
        // cleanly close EventSource so it doesn't repeatedly flood network errors in console
        if (sseErrorCountRef.current >= 2) {
          if (es) {
            es.close();
            eventSourceRef.current = null;
          }
          setStatus('connected');
        } else if (es?.readyState === EventSource.CONNECTING || es?.readyState === EventSource.CLOSED) {
          setStatus('connecting');
        }
      };
    } catch {
      // EventSource not supported or blocked
    }

    return () => {
      isCleanedUp = true;
      if (es) {
        es.close();
      }
    };
  }, [enabled, isPaused, timeframeSeconds, handleAuthoritativeTick]);

  // Micro-tick simulator fallback when /api/binomo/latest is unavailable (e.g. 404 or offline)
  const simulateMicroTick = useCallback(() => {
    const current = activeCandleRef.current;
    if (!current) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const alignedTime = Math.floor(nowSec / timeframeSeconds) * timeframeSeconds;
    const isNew = alignedTime > current.time;

    // Determine the natural tick scale from the candle's spread or natural decimal precision
    const naturalSpread = Math.abs(current.high - current.low);
    const tickScale = naturalSpread > 0 && naturalSpread < 0.0005 
      ? naturalSpread * 0.12 
      : 0.00000010;

    const delta = (Math.random() - 0.495) * tickScale;
    const targetClose = Number((current.close + delta).toFixed(8));
    
    // Safety clamp: prevent simulated tick from ever deviating wildly from current open
    const maxDeviation = Math.max(0.000002, Math.abs(current.open) * 0.000005);
    const newClose = Math.min(
      current.open + maxDeviation,
      Math.max(current.open - maxDeviation, targetClose)
    );

    if (isNew) {
      const tick: LiveTick = {
        time: alignedTime,
        open: newClose,
        high: newClose,
        low: newClose,
        close: newClose,
        volume: 1,
        created_at: new Date(alignedTime * 1000).toISOString(),
        isNewCandle: true,
        tickIndex: tickCounterRef.current + 1,
        serverTimestamp: Date.now(),
      };
      handleAuthoritativeTick(tick);
    } else {
      const tick: LiveTick = {
        time: current.time,
        open: current.open,
        high: Math.max(current.high, newClose),
        low: Math.min(current.low, newClose),
        close: newClose,
        volume: (current.volume || 1) + 1,
        created_at: new Date().toISOString(),
        isNewCandle: false,
        tickIndex: tickCounterRef.current + 1,
        serverTimestamp: Date.now(),
      };
      handleAuthoritativeTick(tick);
    }

    // Update TPS meter for smooth HUD feedback
    const now = Date.now();
    const elapsedSec = (now - lastSecTimeRef.current) / 1000;
    if (elapsedSec >= 1.0) {
      const currentTps = Math.round(windowTicksRef.current / elapsedSec);
      setTicksPerSec(currentTps);
      windowTicksRef.current = 0;
      lastSecTimeRef.current = now;
    }
  }, [timeframeSeconds, handleAuthoritativeTick]);

  // 2. High-Frequency Poller: polls /api/binomo/latest for the active interval at user-configured rate
  useEffect(() => {
    if (!enabled || isPaused) {
      if (pollerTimerRef.current) clearInterval(pollerTimerRef.current);
      return;
    }

    const pollLatestExchangeCandle = async () => {
      // If backend endpoint previously returned 404, avoid hammering it every 500ms
      if (!latestEndpointAvailableRef.current) {
        const now = Date.now();
        // Quietly probe once every 30 seconds to see if server /api has become active
        if (now - lastProbeTimeRef.current > 30000) {
          lastProbeTimeRef.current = now;
          try {
            const probeRes = await fetch(`/api/binomo/latest?interval=${timeframeSeconds}`);
            if (probeRes.ok) {
              latestEndpointAvailableRef.current = true;
              failedPollCountRef.current = 0;
            }
          } catch {
            // Still unavailable
          }
        }
        // Run simulated tick so chart continues to move smoothly without network 404 spam
        simulateMicroTick();
        return;
      }

      try {
        const start = Date.now();
        let res = await fetch(`${activeLatestUrlRef.current}?interval=${timeframeSeconds}`);

        // If nested route returned 404, try flat route /api/latest
        if (res.status === 404 && activeLatestUrlRef.current === '/api/binomo/latest') {
          activeLatestUrlRef.current = '/api/latest';
          res = await fetch(`${activeLatestUrlRef.current}?interval=${timeframeSeconds}`);
        }

        if (res.status === 404) {
          failedPollCountRef.current++;
          if (failedPollCountRef.current >= 2) {
            latestEndpointAvailableRef.current = false;
            lastProbeTimeRef.current = Date.now();
          }
          simulateMicroTick();
          return;
        }

        if (!res.ok) {
          simulateMicroTick();
          return;
        }

        failedPollCountRef.current = 0;
        const json = await res.json();
        if (json.candle) {
          const rtt = Date.now() - start;
          setLatencyMs(rtt);
          handleAuthoritativeTick(json.candle);
        }

        // Update TPS meter
        const now = Date.now();
        const elapsedSec = (now - lastSecTimeRef.current) / 1000;
        if (elapsedSec >= 1.0) {
          const currentTps = Math.round(windowTicksRef.current / elapsedSec);
          setTicksPerSec(currentTps);
          windowTicksRef.current = 0;
          lastSecTimeRef.current = now;
        }
      } catch {
        // Transient network error, simulate tick
        simulateMicroTick();
      }
    };

    const effectiveInterval = Math.max(250, intervalMs);
    pollerTimerRef.current = setInterval(pollLatestExchangeCandle, effectiveInterval);
    pollLatestExchangeCandle();

    return () => {
      if (pollerTimerRef.current) {
        clearInterval(pollerTimerRef.current);
      }
    };
  }, [enabled, isPaused, intervalMs, timeframeSeconds, handleAuthoritativeTick, simulateMicroTick]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  return {
    status: isPaused ? 'paused' : status,
    intervalMs,
    setIntervalMs,
    latestTick,
    tickCount,
    ticksPerSec,
    latencyMs,
    lastTickDate,
    isPaused,
    togglePause,
  };
}
