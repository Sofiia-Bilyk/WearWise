import React, { useRef } from 'react';
import { Upload } from 'lucide-react';

interface ItemImagePanelProps {
  imageSrc: string;
  altText: string;
  isEditing: boolean;
  onImageSelected: (dataUrl: string) => void;
}

/** Left side of the item detail modal: image with optional "change photo" control. */
export const ItemImagePanel: React.FC<ItemImagePanelProps> = ({
  imageSrc,
  altText,
  isEditing,
  onImageSelected,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImageSelected(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full md:w-1/2 h-48 md:h-auto relative bg-stone-200">
      <img src={imageSrc} alt={altText} className="w-full h-full object-cover" />
      {isEditing && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 text-stone-700 text-[10px] font-bold uppercase tracking-widest rounded-full shadow hover:bg-white transition-colors"
          >
            <Upload size={14} aria-hidden="true" />
            Change Photo
          </button>
        </>
      )}
    </div>
  );
};
