import React, { useRef, useState } from 'react';
import { useWardrobe } from '../contexts/WardrobeContext';
import { Category, ClothingItem } from '../types';
import { WardrobePickerModal } from '../components/WardrobePickerModal';
import { CameraStage } from '../components/CameraStage';
import { DetectionPanel } from '../components/DetectionPanel';
import { DetectedItemEditForm } from '../components/DetectedItemRow';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { useImageUpload } from '../hooks/useImageUpload';
import { useDetection } from '../hooks/useDetection';

const today = () => new Date().toISOString().split('T')[0];

/**
 * "Log a look" page: stitches the camera/upload stage with the detection
 * panel, and persists the chosen items as an outfit.
 */
export const CameraView: React.FC = () => {
  const { wardrobe, addOutfit, addItem } = useWardrobe();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedDate, setSelectedDate] = useState(today);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DetectedItemEditForm>({
    name: '',
    category: 'Top',
    color: '',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [isLogSuccess, setIsLogSuccess] = useState(false);
  const [logError, setLogError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);

  const {
    isDetecting,
    detectedItems,
    setDetectedItems,
    apiError,
    noDetectionMsg,
    runDetection,
    resetDetection,
  } = useDetection();

  const {
    uploadedImage,
    uploadedFile,
    conversionError,
    handleFileUpload,
    reset: resetUpload,
  } = useImageUpload(runDetection);

  const { videoRef, canvasRef, permissionError, startCamera, captureFrame } =
    useCameraCapture((dataUrl, file) => {
      setCapturedFile(file);
      setCapturedImage(dataUrl);
      runDetection(dataUrl);
    });

  // Uploaded file wins over the captured frame so the user's explicit choice sticks.
  const outfitFile = uploadedFile ?? capturedFile;
  const previewImage = uploadedImage || capturedImage;

  const handleRetry = () => {
    resetDetection();
    resetUpload();
    setCapturedFile(null);
    setCapturedImage(null);
    setLogError('');
    setIsLogSuccess(false);
    setEditingItemId(null);
  };

  const handleLogOutfit = async () => {
    if (detectedItems.length === 0) return;
    setIsLogging(true);
    setLogError('');
    try {
      const realItems = await Promise.all(
        detectedItems.map((item) =>
          item.id.startsWith('det-') ? addItem(item) : Promise.resolve(item)
        )
      );
      await addOutfit(realItems, selectedDate, outfitFile);
      setIsLogSuccess(true);
      setTimeout(handleRetry, 3000);
    } catch (err: unknown) {
      setLogError(err instanceof Error ? err.message : 'Failed to log outfit');
    } finally {
      setIsLogging(false);
    }
  };

  const startEditing = (item: ClothingItem) => {
    setEditingItemId(item.id);
    setEditForm({ name: item.name, category: item.category, color: item.color });
  };

  const saveEditing = (id: string) => {
    setDetectedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...editForm } : item))
    );
    setEditingItemId(null);
  };

  const createBlankItem = () => {
    const newItem: ClothingItem = {
      id: `det-manual-${Date.now()}`,
      name: 'New Item',
      category: 'Top' as Category,
      color: '',
      image: '',
      brand: '',
      addedDate: today(),
      wearCount: 0,
      lastWorn: 'Never',
    };
    setDetectedItems((prev) => [...prev, newItem]);
    startEditing(newItem);
    setIsModalOpen(false);
  };

  const removeDetectedItem = (id: string) =>
    setDetectedItems((prev) => prev.filter((item) => item.id !== id));

  const addItemFromWardrobe = (item: ClothingItem) => {
    if (!detectedItems.find((i) => i.id === item.id)) {
      setDetectedItems((prev) => [...prev, item]);
    }
    setIsModalOpen(false);
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="flex h-[calc(100vh-80px)] w-full overflow-hidden bg-stone-900">
      <CameraStage
        videoRef={videoRef}
        canvasRef={canvasRef}
        fileInputRef={fileInputRef}
        previewImage={previewImage}
        permissionError={permissionError}
        isDetecting={isDetecting}
        isLogSuccess={isLogSuccess}
        detectedItems={detectedItems}
        apiError={apiError}
        conversionError={conversionError}
        noDetectionMsg={noDetectionMsg}
        onStartCamera={startCamera}
        onCapture={captureFrame}
        onUploadClick={openFilePicker}
        onFileChange={handleFileUpload}
        onRetry={handleRetry}
      />

      <DetectionPanel
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        detectedItems={detectedItems}
        isDetecting={isDetecting}
        isLogSuccess={isLogSuccess}
        isLogging={isLogging}
        hasPreviewImage={!!previewImage}
        logError={logError}
        editingItemId={editingItemId}
        editForm={editForm}
        onEditFormChange={setEditForm}
        onStartEdit={startEditing}
        onSaveEdit={saveEditing}
        onRemoveItem={removeDetectedItem}
        onUploadClick={openFilePicker}
        onBrowseWardrobe={() => setIsModalOpen(true)}
        onCreateBlank={createBlankItem}
        onLogOutfit={handleLogOutfit}
        onRetry={handleRetry}
      />

      {isModalOpen && (
        <WardrobePickerModal
          wardrobe={wardrobe}
          onSelect={addItemFromWardrobe}
          onCreateBlank={createBlankItem}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
