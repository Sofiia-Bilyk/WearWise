import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWardrobe } from '../contexts/WardrobeContext';
import type { ClothingItem } from '../types';
import { WardrobePickerModal } from '../components/WardrobePickerModal';
import { CreateItemModal } from '../components/CreateItemModal';
import { UnrecognizedGarmentModal } from '../components/UnrecognizedGarmentModal';
import { CameraStage } from '../components/CameraStage';
import { DetectionPanel } from '../components/DetectionPanel';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { useImageUpload } from '../hooks/useImageUpload';
import { useDetection } from '../hooks/useDetection';
import { useGarmentResolution } from '../hooks/useGarmentResolution';
import { buildSavePlan } from '../state/garmentResolution';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
type Selection = { kind: 'wardrobe' | 'new'; detectionId: string | null } | null;

/** Detect -> identify unmatched crops -> review draft -> confirm the daily log. */
export const CameraView: React.FC = () => {
  const { wardrobe, addOutfit, addItem } = useWardrobe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selection, setSelection] = useState<Selection>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [isLogSuccess, setIsLogSuccess] = useState(false);
  const [logError, setLogError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const savingRef = useRef(false);
  // Remember successfully created items if a later request fails during saving.
  const savedItems = useRef(new Map<string, ClothingItem>());
  const detector = useDetection();
  const draft = useGarmentResolution();
  const wardrobeRef = useRef(wardrobe);
  wardrobeRef.current = wardrobe;
  const currentDateValid = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate);

  const runDetection = async (image: string) => {
    if (savingRef.current) return;
    draft.reset(); setSelection(null); savedItems.current.clear();
    setIsLogSuccess(false); setLogError('');
    const detections = await detector.runDetection(image);
    if (detections) draft.begin(detections, wardrobeRef.current);
  };
  const upload = useImageUpload(runDetection);
  const camera = useCameraCapture((dataUrl, file) => {
    if (savingRef.current) return;
    upload.reset(); setCapturedFile(file); setCapturedImage(dataUrl);
    void runDetection(dataUrl);
  });
  const outfitFile = upload.uploadedFile ?? capturedFile;
  const previewImage = upload.uploadedImage || capturedImage;

  // Changing accounts must not leave another account's draft or photo visible.
  const { user } = useAuth();
  const accountId = useRef(user?.id);
  useEffect(() => {
    if (accountId.current !== user?.id) { accountId.current = user?.id; handleRetry(); }
  }, [user?.id]);

  function handleRetry() {
    if (savingRef.current) return;
    detector.resetDetection(); draft.reset(); upload.reset();
    setSelection(null); savedItems.current.clear();
    setCapturedFile(null); setCapturedImage(null); setLogError(''); setIsLogSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleLogOutfit = async () => {
    if (savingRef.current || detector.isDetecting || isLogSuccess) return;
    if (!currentDateValid) { setLogError('Choose a date for this daily log.'); return; }
    try {
      // Validate every choice before creating any wardrobe entries.
      const knownItems = [...wardrobe, ...savedItems.current.values()];
      const plan = buildSavePlan(draft.garments, knownItems);
      savingRef.current = true; setIsLogging(true); setLogError('');
      const realItems: ClothingItem[] = [];
      for (const entry of plan) {
        let item = entry.item;
        if (entry.kind === 'new') {
          item = savedItems.current.get(entry.detectionId) ?? await addItem(entry.item);
          savedItems.current.set(entry.detectionId, item);
          draft.resolve(entry.detectionId, { kind: 'existing', itemId: item.id });
        }
        realItems.push(item);
      }
      await addOutfit([...new Map(realItems.map(item => [item.id, item])).values()], selectedDate, outfitFile);
      setIsLogSuccess(true);
    } catch (error: unknown) {
      setLogError(error instanceof Error ? error.message : 'Could not save the daily log. Please try again.');
    } finally {
      savingRef.current = false; setIsLogging(false);
    }
  };

  const target = selection?.detectionId
    ? draft.garments.find(row => row.detection.id === selection.detectionId) : null;
  const initialItem = target?.resolution?.kind === 'new' ? target.resolution.item : target?.detection;
  const selectExisting = (item: ClothingItem) => {
    if (selection?.detectionId) draft.resolve(selection.detectionId, { kind: 'existing', itemId: item.id });
    else draft.append(item, true);
    setSelection(null);
  };
  const confirmNew = (item: ClothingItem) => {
    if (selection?.detectionId) draft.resolve(selection.detectionId, { kind: 'new', item });
    else draft.append(item, false);
    setSelection(null);
  };
  const displayItems = draft.garments.map(row => {
    const choice = row.resolution;
    const item = choice?.kind === 'existing'
      ? wardrobe.find(item => item.id === choice.itemId) ?? savedItems.current.get(row.detection.id) ?? row.detection
      : choice?.kind === 'new' ? choice.item : row.detection;
    // Actions address the stable detection ID, not the selected wardrobe ID.
    return { ...item, id: row.detection.id };
  });
  const changeItem = (id: string) => {
    const row = draft.garments.find(row => row.detection.id === id);
    if (row?.resolution?.kind === 'new') setSelection({ kind: 'new', detectionId: id });
    else draft.reconsider(id);
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100dvh-80px)] w-full overflow-y-auto lg:overflow-hidden bg-stone-900">
      <CameraStage
        videoRef={camera.videoRef} canvasRef={camera.canvasRef} fileInputRef={fileInputRef}
        previewImage={previewImage} permissionError={camera.permissionError}
        isDetecting={detector.isDetecting} isLogSuccess={isLogSuccess}
        detectedItems={draft.garments.map(row => row.detection)} apiError={detector.apiError}
        conversionError={upload.conversionError} noDetectionMsg={detector.noDetectionMsg}
        disabled={isLogging || isLogSuccess}
        onStartCamera={camera.startCamera} onCapture={camera.captureFrame}
        onUploadClick={() => fileInputRef.current?.click()}
        onFileChange={upload.handleFileUpload} onRetry={handleRetry}
      />
      <DetectionPanel selectedDate={selectedDate} onDateChange={setSelectedDate}
        detectedItems={displayItems} garments={draft.garments}
        isDetecting={detector.isDetecting} isLogSuccess={isLogSuccess} isLogging={isLogging}
        canSubmit={draft.canSubmit && currentDateValid} unresolvedCount={draft.unresolvedCount}
        hasPreviewImage={!!previewImage} logError={logError}
        onChangeItem={changeItem} onRemoveItem={draft.remove} onResume={draft.resume}
        onUploadClick={() => fileInputRef.current?.click()}
        onBrowseWardrobe={() => setSelection({ kind: 'wardrobe', detectionId: null })}
        onCreateBlank={() => setSelection({ kind: 'new', detectionId: null })}
        onLogOutfit={handleLogOutfit} onRetry={handleRetry}
      />
      {draft.currentGarment && !selection && !isLogging && !isLogSuccess && (
        <UnrecognizedGarmentModal key={draft.currentGarment.detection.id}
          item={draft.currentGarment.detection} remainingCount={draft.unresolvedCount}
          onFindInWardrobe={() => setSelection({ kind: 'wardrobe', detectionId: draft.currentGarment!.detection.id })}
          onCreateNew={() => setSelection({ kind: 'new', detectionId: draft.currentGarment!.detection.id })}
          onPause={draft.pause} />
      )}
      {selection?.kind === 'wardrobe' && (
        <WardrobePickerModal wardrobe={wardrobe} onSelect={selectExisting}
          onCreateBlank={() => setSelection({ ...selection, kind: 'new' })}
          onClose={() => setSelection(null)} />
      )}
      {selection?.kind === 'new' && (
        <CreateItemModal key={selection.detectionId ?? 'manual'} initialItem={initialItem}
          title="New item for this look" submitLabel="Add to draft"
          onCreateItem={confirmNew} onClose={() => setSelection(null)} />
      )}
    </div>
  );
};
