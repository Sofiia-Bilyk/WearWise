import { useRef, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import heic2any from 'heic2any';

export function useImageUpload(onReady: (dataUrl: string, file: File) => void) {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
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
    setConversionError(null);
    if (!e.target.files?.[0]) return;
    let file = e.target.files[0];

    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
      try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        file = new File([blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
      } catch (err) {
        console.error('HEIC conversion error:', err);
        setConversionError('Could not convert HEIC format. Please try another image.');
        return;
      }
    }

    setImage(file);

    const img = new Image();
    img.onload = () => {
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
    };
    img.src = URL.createObjectURL(file);
  };

  const reset = () => {
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
