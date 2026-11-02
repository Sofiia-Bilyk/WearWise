import { useRef, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import heic2any from 'heic2any';

export function useImageUpload(onReady: (dataUrl: string, file: File) => void) {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  // Invalidate conversion/image-load callbacks after Retry or a newer photo.
  const versionRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      versionRef.current++;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const setImage = (file: File) => {
    setUploadedFile(file);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setUploadedImage(url);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const version = ++versionRef.current;
    setConversionError(null);
    let file = e.target.files[0];
    // Let the same photo be selected again after a failed attempt.
    e.target.value = '';

    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
      try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        file = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
      } catch (err) {
        if (version !== versionRef.current) return;
        console.error('HEIC conversion error:', err);
        setConversionError('Could not convert HEIC format. Please try another image.');
        return;
      }
    }

    if (version !== versionRef.current) return;
    setImage(file);

    const img = new Image();
    img.onload = () => {
      if (version !== versionRef.current) { URL.revokeObjectURL(img.src); return; }
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const MAX_DIM = 1080;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        onReady(canvas.toDataURL('image/jpeg', 0.85), file);
      }
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      if (version === versionRef.current) setConversionError('Could not read this image. Please choose another photo.');
    };
    img.src = URL.createObjectURL(file);
  };

  const reset = () => {
    versionRef.current++;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setUploadedImage(null);
    setUploadedFile(null);
    setConversionError(null);
  };

  return {
    uploadedImage,
    uploadedFile,
    conversionError,
    handleFileUpload,
    reset,
  };
}
