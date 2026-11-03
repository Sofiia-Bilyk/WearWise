import { useRef, useEffect, useState, useCallback } from 'react';

export function useCameraCapture(onFrame: (dataUrl: string, file: File) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  const activeStream = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const cameraRequest = useRef(0);

  const stopCamera = useCallback(() => {
    activeStream.current?.getTracks().forEach(track => track.stop());
    activeStream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!mounted.current) return;
    const requestId = ++cameraRequest.current;
    stopCamera();
    setStream(null);
    setPermissionError(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Permission can resolve after navigation or a newer camera request.
      if (!mounted.current || requestId !== cameraRequest.current) {
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }
      activeStream.current = mediaStream;
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch {
      if (mounted.current && requestId === cameraRequest.current) setPermissionError(true);
    }
  }, [stopCamera]);

  useEffect(() => {
    mounted.current = true;
    void startCamera();
    return () => {
      mounted.current = false;
      cameraRequest.current++;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      onFrame(canvas.toDataURL('image/jpeg', 0.85), file);
    }, 'image/jpeg', 0.85);
  }, [onFrame]);

  return { videoRef, canvasRef, stream, permissionError, startCamera, captureFrame };
}
