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
import { outfitsApi } from '../api/outfits';
import { prepareSubmission, saveReceipt, readReceipt, clearReceipt } from '../state/outfitSubmission';
import type { OutfitSubmission } from '../state/outfitSubmission';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
type Selection = { kind: 'wardrobe' | 'new'; detectionId: string | null } | null;

/** Detect -> identify unmatched crops -> review draft -> confirm the daily log. */
export const CameraView: React.FC = () => {
  const { wardrobe, applySavedSubmission } = useWardrobe();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selection, setSelection] = useState<Selection>(null);
  const [isLogging, setIsLogging] = useState(false);
  const [isLogSuccess, setIsLogSuccess] = useState(false);
  const [logError, setLogError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const savingRef = useRef(false);
  const pendingSubmission = useRef<{ payload: OutfitSubmission; photo: File | null } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(true);
  const draftLocked = isLogging || isRecovering || pendingKey !== null;
  const detector = useDetection();
  const draft = useGarmentResolution();
  const wardrobeRef = useRef(wardrobe);
  wardrobeRef.current = wardrobe;
  const currentDateValid = /^\d{4}-\d{2}-\d{2}$/.test(selectedDate);

  const runDetection = async (image: string) => {
    if (savingRef.current || draftLocked) return;
    draft.reset(); setSelection(null);
    setIsLogSuccess(false); setLogError('');
    const detections = await detector.runDetection(image);
    if (detections) draft.begin(detections, wardrobeRef.current);
  };
  const upload = useImageUpload(runDetection);
  const camera = useCameraCapture((dataUrl, file) => {
    if (savingRef.current || draftLocked) return;
    upload.reset(); setCapturedFile(file); setCapturedImage(dataUrl);
    void runDetection(dataUrl);
  });
  const outfitFile = upload.uploadedFile ?? capturedFile;
  const previewImage = upload.uploadedImage || capturedImage;

  const { user } = useAuth();
  const activeAccount = useRef(user?.id);
  activeAccount.current = user?.id;

  // On refresh only the account-scoped receipt survives. Resolve it before
  // allowing a new draft; cancellation blocks any delayed original request.
  useEffect(() => {
    let active = true;
    pendingSubmission.current = null;
    draft.reset(); detector.resetDetection(); upload.reset();
    setSelection(null); setCapturedFile(null); setCapturedImage(null);
    setIsLogSuccess(false); setLogError(''); setPendingKey(null);
    if (!user) { setIsRecovering(false); return; }
    const account = user.id;
    setIsRecovering(true);
    const recover = async () => {
      try {
        const key = readReceipt(account);
        if (!key) return;
        if (active) setPendingKey(key);
        const resolution = await outfitsApi.resolveSubmission(key);
        if (!active) return;
        if (resolution.status === 'saved' && resolution.result) {
          applySavedSubmission(resolution.result);
          setIsLogSuccess(true);
        } else if (resolution.status !== 'cancelled') {
          throw new Error('The previous save is still pending. Check again before starting another log.');
        }
        clearReceipt(account);
        setPendingKey(null);
      } catch (error) {
        if (active) setLogError(error instanceof Error ? error.message : 'Could not recover the previous save.');
        // A blocked receipt store must not silently disable retry protection.
        if (active) setPendingKey(previous => previous ?? 'storage-unavailable');
      } finally {
        if (active) setIsRecovering(false);
      }
    };
    void recover();
    return () => { active = false; };
  }, [user?.id]);

  function handleRetry() {
    if (savingRef.current || draftLocked) return;
    detector.resetDetection(); draft.reset(); upload.reset();
    setSelection(null); pendingSubmission.current = null;
    setCapturedFile(null); setCapturedImage(null); setLogError(''); setIsLogSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const handleLogOutfit = async () => {
    if (savingRef.current || isRecovering || detector.isDetecting || isLogSuccess || !user) return;
    const account = user.id;
    savingRef.current = true; setIsLogging(true); setLogError('');
    try {
      if (!pendingSubmission.current) {
        if (pendingKey) throw new Error('Check the previous save before starting another log.');
        const payload = prepareSubmission(draft.garments, wardrobe, selectedDate, crypto.randomUUID());
        // Store the receipt before sending any network request.
        saveReceipt(account, payload.submissionId);
        pendingSubmission.current = { payload, photo: outfitFile };
        setPendingKey(payload.submissionId);
      }
      const attempt = pendingSubmission.current;
      const result = await outfitsApi.submit(attempt.payload, attempt.photo);
      if (activeAccount.current !== account) return;
      applySavedSubmission(result);
      clearReceipt(account);
      pendingSubmission.current = null; setPendingKey(null); setIsLogSuccess(true);
    } catch (error: unknown) {
      if (activeAccount.current === account) setLogError(error instanceof Error ? error.message : 'Could not confirm saving. Retry or check save status.');
    } finally {
      savingRef.current = false; setIsLogging(false);
    }
  };

  const handleCheckSave = async () => {
    if (savingRef.current || !user) return;
    const account = user.id;
    savingRef.current = true; setIsLogging(true); setLogError('');
    try {
      const key = pendingSubmission.current?.payload.submissionId ?? readReceipt(account);
      if (!key) {
        pendingSubmission.current = null;
        setPendingKey(null);
        return;
      }
      const resolution = await outfitsApi.resolveSubmission(key);
      if (activeAccount.current !== account) return;
      if (resolution.status === 'saved' && resolution.result) {
        applySavedSubmission(resolution.result); setIsLogSuccess(true);
      } else if (resolution.status !== 'cancelled') {
        throw new Error('The save is still pending. Check again shortly.');
      } else {
        setLogError('The previous attempt was not saved. You can edit and confirm your draft again.');
      }
      clearReceipt(account);
      pendingSubmission.current = null; setPendingKey(null);
    } catch (error) {
      if (activeAccount.current === account) setLogError(error instanceof Error ? error.message : 'Could not check saving.');
    } finally {
      savingRef.current = false; setIsLogging(false);
    }
  };

  const target = selection?.detectionId
    ? draft.garments.find(row => row.detection.id === selection.detectionId) : null;
  const initialItem = target?.resolution?.kind === 'new' ? target.resolution.item : target?.detection;
  const selectExisting = (item: ClothingItem) => {
    if (draftLocked) return;
    if (selection?.detectionId) draft.resolve(selection.detectionId, { kind: 'existing', itemId: item.id });
    else draft.append(item, true);
    setSelection(null);
  };
  const confirmNew = (item: ClothingItem) => {
    if (draftLocked) return;
    if (selection?.detectionId) draft.resolve(selection.detectionId, { kind: 'new', item });
    else draft.append(item, false);
    setSelection(null);
  };
  const displayItems = draft.garments.map(row => {
    const choice = row.resolution;
    const item = choice?.kind === 'existing'
      ? wardrobe.find(item => item.id === choice.itemId) ?? row.detection
      : choice?.kind === 'new' ? choice.item : row.detection;
    // Actions address the stable detection ID, not the selected wardrobe ID.
    return { ...item, id: row.detection.id };
  });
  const changeItem = (id: string) => {
    if (draftLocked) return;
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
        disabled={draftLocked || isLogSuccess}
        onStartCamera={camera.startCamera} onCapture={camera.captureFrame}
        onUploadClick={() => fileInputRef.current?.click()}
        onFileChange={upload.handleFileUpload} onRetry={handleRetry}
      />
      <DetectionPanel selectedDate={selectedDate} onDateChange={setSelectedDate}
        detectedItems={displayItems} garments={draft.garments}
        isDetecting={detector.isDetecting} isLogSuccess={isLogSuccess} isLogging={isLogging}
        canSubmit={draft.canSubmit && currentDateValid}
        draftLocked={draftLocked} hasPendingSave={pendingKey !== null} canRetrySave={pendingSubmission.current !== null}
        onCheckSave={handleCheckSave} unresolvedCount={draft.unresolvedCount}
        hasPreviewImage={!!previewImage} logError={logError}
        onChangeItem={changeItem} onRemoveItem={draft.remove} onResume={draft.resume}
        onUploadClick={() => fileInputRef.current?.click()}
        onBrowseWardrobe={() => setSelection({ kind: 'wardrobe', detectionId: null })}
        onCreateBlank={() => setSelection({ kind: 'new', detectionId: null })}
        onLogOutfit={handleLogOutfit} onRetry={handleRetry}
      />
      {draft.currentGarment && !selection && !draftLocked && !isLogSuccess && (
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
