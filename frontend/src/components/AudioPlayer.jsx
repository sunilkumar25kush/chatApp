import { useState, useRef, useEffect } from 'react';
export default function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      } else {
        // Fallback for some browsers that stream webm duration
        setDuration(0);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const changeSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    audioRef.current.playbackRate = nextSpeed;
    setSpeed(nextSpeed);
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = percent * audioRef.current.duration;
      setProgress(percent * 100);
    }
  };

  return (
    <div className="audio-player-container" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#222530', padding: '8px 12px', borderRadius: 24, border: '1px solid #3f4657', width: '100%', maxWidth: 280, minWidth: 0, marginTop: 6, boxSizing: 'border-box' }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Play / Pause */}
      <button 
        onClick={togglePlay}
        style={{ width: 36, height: 36, borderRadius: '50%', background: '#5865F2', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Fake Waveform / Progress */}
      <div 
        onClick={handleSeek}
        style={{ flex: 1, height: 24, display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}
      >
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, background: '#3f4657', borderRadius: 2, transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, width: `${progress}%`, height: 4, background: '#5865F2', borderRadius: 2, transform: 'translateY(-50%)', transition: 'width 0.1s linear' }} />
        {isPlaying && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, opacity: 0.5 }}>
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} style={{ width: 3, background: '#a5b4fc', borderRadius: 2, animation: `audio-wave 1s infinite alternate ${i * 0.1}s` }} />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <button onClick={changeSpeed} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {speed}x
        </button>
        <a href={src} download="VoiceNote" style={{ color: '#6b7280', fontSize: 14, textDecoration: 'none' }} title="Download">
          ⬇
        </a>
      </div>
    </div>
  );
}
