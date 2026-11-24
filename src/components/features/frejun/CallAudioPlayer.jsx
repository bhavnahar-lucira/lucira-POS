'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function CallAudioPlayer({
  src,
  compact = false,
  downloadable = true,
  className,
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);
  const [useFallback, setUseFallback] = useState(false);

  // If src changes, reset fallback during render (official React pattern)
  if (prevSrc !== src) {
    setPrevSrc(src);
    setUseFallback(false);
  }

  // Proxy external URLs via our server-side streaming endpoint to bypass S3 CORS & redirects
  const audioSrc = useMemo(() => {
    if (!src) return '';
    if (useFallback) return src;
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return `/api/frejun/recording?url=${encodeURIComponent(src)}`;
    }
    return src;
  }, [src, useFallback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setHasError(false);
    setIsPlaying(false);
    setCurrentTime(0);

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setHasError(false);
    };
    const onError = () => {
      if (!useFallback && (src.startsWith('http://') || src.startsWith('https://'))) {
        console.warn('[CallAudioPlayer] Proxy failed, falling back to direct URL');
        setUseFallback(true);
        return;
      }
      setIsPlaying(false);
      setHasError(true);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, [audioSrc, src, useFallback]);

  const togglePlay = (e) => {
    e?.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      setHasError(false);
      audio.play().catch((err) => {
        console.warn('Audio playback error:', err);
        setHasError(true);
      });
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const seekTime = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
      setCurrentTime(seekTime);
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const cycleSpeed = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const speeds = [1, 1.25, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    audioRef.current.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
  };

  const formatSeconds = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!src) {
    return <span className="text-xs text-muted-foreground italic">No recording</span>;
  }

  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-1.5', className)} onClick={(e) => e.stopPropagation()}>
        <audio ref={audioRef} src={audioSrc} preload="none" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            'h-7 w-7 rounded-full p-0 shadow-none border-primary/30 text-primary hover:bg-primary/10',
            hasError && 'border-destructive/40 text-destructive'
          )}
          onClick={togglePlay}
          title={hasError ? 'Playback error' : isPlaying ? 'Pause' : 'Play recording'}
          aria-label={isPlaying ? 'Pause' : 'Play recording'}
        >
          {hasError ? (
            <AlertCircle size={12} className="text-destructive" />
          ) : isPlaying ? (
            <Pause size={12} />
          ) : (
            <Play size={12} className="ml-0.5" />
          )}
        </Button>
        {duration > 0 && !hasError && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatSeconds(isPlaying ? currentTime : duration)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card/60 p-3 shadow-sm flex flex-col gap-2',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={audioSrc} preload="metadata" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 w-8 rounded-full p-0 shadow-sm"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
          >
            {hasError ? <AlertCircle size={14} /> : isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </Button>

          <span className="text-xs font-medium text-foreground">
            {hasError ? 'Unable to stream recording' : isPlaying ? 'Playing recording' : 'Call recording'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={cycleSpeed}
            title="Playback speed"
          >
            {playbackRate}x
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </Button>

          {downloadable && (
            <a
              href={audioSrc}
              target="_blank"
              rel="noopener noreferrer"
              download="call-recording.wav"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
              title="Download recording"
            >
              <Download size={14} />
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">
          {formatSeconds(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="h-1.5 flex-1 cursor-pointer accent-primary rounded-lg bg-muted appearance-none"
        />
        <span className="text-xs tabular-nums text-muted-foreground w-9">
          {formatSeconds(duration)}
        </span>
      </div>
    </div>
  );
}
