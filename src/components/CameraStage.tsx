import React, { RefObject } from 'react';
import { Camera, Upload } from 'lucide-react';
import { Detection } from '../api/detection';

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  previewImage: string | null;
  permissionError: string | null;
  isDetecting: boolean;
  isLogSuccess: boolean;
  detectedItems: Detection[];
  apiError: string | null;
  conversionError: string | null;
  noDetectionMsg: boolean;
  onStartCamera: () => void;
  onCapture: () => void;
  onUploadClick: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRetry: () => void;
}

/**
 * Left half of the camera page: live video feed (or uploaded preview),
 * scanning overlay, detection bbox labels, and the always-visible
 * Capture/Upload toolbar.
 */
export const CameraStage: React.FC<CameraStageProps> = ({
  videoRef,
  canvasRef,
  fileInputRef,
  previewImage,
  permissionError,
  isDetecting,
  isLogSuccess,
  detectedItems,
  apiError,
  conversionError,
  noDetectionMsg,
  onStartCamera,
  onCapture,
  onUploadClick,
  onFileChange,
  onRetry,
}) => (
  <div className="relative flex-grow h-full bg-black overflow-hidden flex items-center justify-center group">
    {permissionError && !previewImage ? (
      <div className="text-center p-8 bg-stone-800 rounded-2xl max-w-md mx-4">
        <Camera className="w-12 h-12 text-stone-500 mx-auto mb-4" aria-hidden="true" />
        <h3 className="text-white text-xl font-semibold mb-2">Camera Access Required</h3>
        <p className="text-stone-400 mb-6">
          Enable camera access to use real-time detection, or upload a photo below.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onStartCamera}
            className="px-6 py-3 bg-primary-500 text-white rounded-full font-bold uppercase tracking-widest text-xs hover:bg-primary-600 transition-all"
          >
            Retry Access
          </button>
          <button
            onClick={onUploadClick}
            className="px-6 py-3 bg-stone-700 text-stone-300 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-stone-600 transition-all"
          >
            Upload Photo Instead
          </button>
        </div>
      </div>
    ) : (
      <>
        {previewImage && (
          <div className="absolute inset-0 w-full h-full bg-stone-900 flex items-center justify-center z-20">
            <img src={previewImage} alt="Uploaded look" className="w-full h-full object-contain" />
            <button
              onClick={onRetry}
              aria-label="Return to live camera"
              title="Return to camera"
              className="absolute top-8 right-8 p-3 bg-black/50 backdrop-blur-md text-white rounded-full hover:bg-black/70 transition-all z-30"
            >
              <Camera size={20} aria-hidden="true" />
            </button>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover opacity-90 scale-x-[-1]"
        />

        <div
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
            isDetecting ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="absolute inset-0 border-[1px] border-white/20 m-8 rounded-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-white/30 rounded-full animate-pulse" />
        </div>

        {(apiError || conversionError) && (
          <div
            role="alert"
            className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-red-500/90 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur-sm"
          >
            {apiError ?? conversionError}
          </div>
        )}
        {noDetectionMsg && !apiError && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-black/60 text-white/80 text-xs px-4 py-2 rounded-full backdrop-blur-sm">
            No clothing detected — try moving closer or adjusting lighting
          </div>
        )}

        {!isLogSuccess &&
          detectedItems.map((item) => {
            const bboxX = item.bbox_x ?? 50;
            const bboxY = item.bbox_y ?? 50;
            const bboxW = item.bbox_w ?? 0;
            const top = bboxY;
            const left = bboxX + bboxW / 2;
            return (
              <div
                key={item.id}
                className="absolute flex flex-col items-center transition-all duration-700 ease-out animate-in fade-in zoom-in-95"
                style={{ top: `${top}%`, left: `${left}%`, width: '180px', transform: 'translateX(-50%)' }}
              >
                <div className="relative group">
                  <div className="absolute -inset-2 bg-white/10 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-pulse" />
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md text-stone-900 px-4 py-2 shadow-sm min-w-[140px] text-center">
                    <p className="font-serif text-sm italic">{item.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-stone-500 mt-0.5">{item.category}</p>
                  </div>
                </div>
              </div>
            );
          })}

        <canvas ref={canvasRef} className="hidden" />
      </>
    )}

    {/* Always-visible toolbar — Capture must not hide behind a hover state
        (3rd user-interview feedback). */}
    <div
      className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3"
      aria-label="Camera actions"
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={onFileChange}
      />
      <button
        onClick={onUploadClick}
        aria-label="Upload a photo from your device"
        className="flex items-center gap-2 px-5 py-2.5 bg-stone-800/80 backdrop-blur-md border border-stone-600 text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-stone-700 transition-all"
      >
        <Upload size={14} aria-hidden="true" /> Upload
      </button>
      {!previewImage && !permissionError && (
        <button
          onClick={onCapture}
          aria-label="Capture the current camera frame"
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-500/90 backdrop-blur-md border border-primary-400 text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-600 transition-all"
        >
          <Camera size={14} aria-hidden="true" /> Capture
        </button>
      )}
    </div>
  </div>
);
