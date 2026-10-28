import { useState, useRef, useEffect } from 'react';
import toast from '../utils/toast';

export default function VoiceRecorder({ onCancel, onSend }) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Microphone Error', {
          description: !window.isSecureContext
            ? 'HTTPS is required to access Microphone on non-localhost IP.'
            : 'Microphone API is not supported by your browser.',
        });
        onCancel();
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[VoiceRecorder Error] Failed to start:', err);
      let desc = 'Could not access microphone: ' + (err.message || 'Unknown error');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        desc = 'Microphone permission was denied in browser/OS settings.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        desc = 'Microphone is currently in use by another app.';
      }
      toast.error('Microphone Access', { description: desc });
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob);
    }
  };

  // Mount-once: auto-start recording when the recorder appears.
  // startRecording is intentionally excluded — it is recreated every render
  // and including it would restart recording on every render.
  useEffect(() => {
    startRecording();
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-once auto-start

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#222530', borderRadius: 24, border: '1px solid #3f4657', flex: 1 }}>
      {audioBlob ? (
        <>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>🗑️</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <audio src={URL.createObjectURL(audioBlob)} controls style={{ height: 30, flex: 1 }} />
          </div>
          <button onClick={handleSend} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ➤
          </button>
        </>
      ) : (
        <>
          <div style={{ color: '#ef4444', animation: 'pulse 1.5s infinite', width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ color: '#f3f4f6', fontSize: 14, flex: 1 }}>{formatDuration(duration)}</span>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>Cancel</button>
          <button onClick={stopRecording} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 16, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Done
          </button>
        </>
      )}
    </div>
  );
}
