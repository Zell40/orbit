import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { activeStore } from '../../../core/networks';

interface VoiceRecorderOpts {
  enabled: boolean;   // canUpload && not the console buffer
  active: string;     // buffer to surface a mic-denied warning in
  onRecorded: (blob: Blob, ext: string) => void;
}

// Encapsulates the MediaRecorder lifecycle (permission → record → opus/webm blob),
// the elapsed-seconds timer with a 5-minute hard cap, and teardown on unmount.
// Split out of Composer; the component just renders `recording`/`recSecs` and
// wires the start/stop/cancel buttons.
export function useVoiceRecorder({ enabled, active, onRecorded }: VoiceRecorderOpts) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recStream = useRef<MediaStream | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancel = useRef(false);
  const recExt = useRef('webm');

  const canRecord = enabled && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  function bestAudioMime(): string {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (const m of cands) if (MediaRecorder.isTypeSupported?.(m)) return m;
    return '';
  }
  function teardownRec() {
    recStream.current?.getTracks().forEach((tr) => tr.stop());
    recStream.current = null;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
  }
  async function startRec() {
    if (recording || !canRecord) return;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { activeStore().getState().pushSystem?.(active, `⚠️ ${t('composer.micDenied')}`); return; }
    const mime = bestAudioMime();
    recExt.current = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = mr; recStream.current = stream; recChunks.current = []; recCancel.current = false;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.current.push(e.data); };
    mr.onstop = () => {
      const cancelled = recCancel.current;
      teardownRec(); setRecording(false); setRecSecs(0);
      const blob = new Blob(recChunks.current, { type: mime || 'audio/webm' });
      recChunks.current = [];
      if (!cancelled && blob.size > 0) onRecorded(blob, recExt.current);
    };
    mr.start();
    setRecording(true); setRecSecs(0);
    recTimer.current = setInterval(() => setRecSecs((s) => {
      if (s + 1 >= 300) { stopRec(); return 300; } // 5-minute hard cap
      return s + 1;
    }), 1000);
  }
  function stopRec() { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); }
  function cancelRec() { recCancel.current = true; stopRec(); }
  // Make sure the mic is released if the composer unmounts mid-recording.
  useEffect(() => () => { recCancel.current = true; try { recRef.current?.stop(); } catch { /* ignore */ } teardownRec(); }, []);

  return { recording, recSecs, canRecord, startRec, stopRec, cancelRec };
}
