import React from 'react';
import { Camera, Check, Loader2 } from 'lucide-react';
import { ClothingItem } from '../types';
import { DetectedItemRow, DetectedItemEditForm } from './DetectedItemRow';

interface DetectionPanelProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  detectedItems: ClothingItem[];
  isDetecting: boolean;
  isLogSuccess: boolean;
  isLogging: boolean;
  hasPreviewImage: boolean;
  logError: string;

  editingItemId: string | null;
  editForm: DetectedItemEditForm;
  onEditFormChange: (form: DetectedItemEditForm) => void;
  onStartEdit: (item: ClothingItem) => void;
  onSaveEdit: (id: string) => void;
  onRemoveItem: (id: string) => void;

  onUploadClick: () => void;
  onBrowseWardrobe: () => void;
  onCreateBlank: () => void;
  onLogOutfit: () => void;
  onRetry: () => void;
}

/**
 * Right-hand panel of the camera page: date picker, list of detected items
 * (with inline edit), and the Log/Retry footer.
 */
export const DetectionPanel: React.FC<DetectionPanelProps> = ({
  selectedDate,
  onDateChange,
  detectedItems,
  isDetecting,
  isLogSuccess,
  isLogging,
  hasPreviewImage,
  logError,
  editingItemId,
  editForm,
  onEditFormChange,
  onStartEdit,
  onSaveEdit,
  onRemoveItem,
  onUploadClick,
  onBrowseWardrobe,
  onCreateBlank,
  onLogOutfit,
  onRetry,
}) => {
  const showEmptyState = detectedItems.length === 0 && !isLogSuccess;
  const canLog = detectedItems.length > 0 && !isLogSuccess && !isLogging;

  return (
    <div className="w-[420px] flex-shrink-0 bg-[#fafaf9] border-l border-stone-200 flex flex-col h-full relative z-10 shadow-2xl">
      <div className="px-6 pt-4 pb-2 bg-[#fafaf9]">
        <h2 className="text-2xl font-serif italic text-stone-900">Daily Look</h2>
        <div className="flex items-center gap-2 mt-2 border-b border-stone-200 pb-1.5">
          <label htmlFor="outfit-date" className="text-[10px] font-bold tracking-widest uppercase text-stone-400">
            Date
          </label>
          <input
            id="outfit-date"
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="bg-transparent text-sm text-stone-600 font-serif focus:outline-none focus:text-primary-600 ml-auto text-right"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">
        {showEmptyState ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <div className="w-16 h-16 border border-stone-300 rounded-full flex items-center justify-center mb-4">
              <Camera size={24} className="text-stone-300" aria-hidden="true" />
            </div>
            <p className="font-serif text-lg italic text-stone-400 mb-1">Capture your style</p>
            <p className="text-stone-400 text-[10px] uppercase tracking-widest max-w-[200px] leading-relaxed">
              Stand in frame and hit Capture, or upload a photo
            </p>
            <button
              onClick={onUploadClick}
              className="mt-5 text-stone-800 text-xs font-bold uppercase tracking-widest border-b border-stone-800 pb-1 hover:text-primary-600 hover:border-primary-600 transition-colors"
            >
              Upload from Gallery
            </button>
          </div>
        ) : isLogSuccess ? (
          <div
            role="status"
            className="h-full flex flex-col items-center justify-center text-center animate-in zoom-in duration-500"
          >
            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4">
              <Check size={24} className="text-stone-800" aria-hidden="true" />
            </div>
            <h3 className="text-2xl font-serif italic text-stone-900 mb-2">Logged.</h3>
            <p className="text-stone-500 font-serif italic text-sm">
              "Style is a way to say who you are without having to speak."
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em]">
                Curated Items
              </span>
              {isDetecting && (
                <span className="text-[10px] font-bold text-primary-500 uppercase tracking-widest animate-pulse">
                  Detecting...
                </span>
              )}
            </div>

            <div className="space-y-4">
              {detectedItems.map((item, idx) => (
                <DetectedItemRow
                  key={item.id}
                  item={item}
                  index={idx}
                  isEditing={editingItemId === item.id}
                  editForm={editForm}
                  onEditFormChange={onEditFormChange}
                  onStartEdit={onStartEdit}
                  onSaveEdit={onSaveEdit}
                  onRemove={onRemoveItem}
                />
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={onBrowseWardrobe}
                className="flex-1 py-2.5 border border-primary-200 text-primary-600 text-[10px] font-bold uppercase tracking-widest hover:border-primary-600 hover:bg-primary-50 transition-all"
              >
                Browse Wardrobe
              </button>
              <button
                onClick={onCreateBlank}
                className="flex-1 py-2.5 bg-stone-100 border border-transparent text-stone-600 text-[10px] font-bold uppercase tracking-widest hover:border-stone-300 transition-all"
              >
                + New Item
              </button>
            </div>
          </>
        )}
      </div>

      <div className="px-6 py-4 bg-[#fafaf9]">
        {logError && (
          <p role="alert" className="text-red-500 text-xs mb-2 text-center">
            {logError}
          </p>
        )}
        <div className="flex gap-2">
          {(hasPreviewImage || detectedItems.length > 0) && !isLogSuccess && (
            <button
              disabled={isLogging}
              onClick={onRetry}
              className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest bg-stone-200 text-stone-600 hover:bg-stone-300 transition-all flex items-center justify-center"
            >
              Retry
            </button>
          )}
          <button
            disabled={!canLog}
            onClick={onLogOutfit}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-[0.15em] transition-all duration-500 flex items-center justify-center gap-2 ${
              canLog
                ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-lg shadow-primary-500/20'
                : 'bg-stone-100 text-stone-300 cursor-not-allowed'
            }`}
          >
            {isLogging ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Saving…
              </>
            ) : isLogSuccess ? (
              'Saved to Journal'
            ) : (
              'Log Entry'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
