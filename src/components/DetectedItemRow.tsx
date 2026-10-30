import React from 'react';
import { Check, Edit2, X } from 'lucide-react';
import { Category, ClothingItem } from '../types';

const EDITABLE_CATEGORIES: Category[] = ['Top', 'Bottom', 'Shoes', 'Outerwear', 'Accessory'];

export interface DetectedItemEditForm {
  name: string;
  category: Category;
  color: string;
}

interface DetectedItemRowProps {
  item: ClothingItem;
  index: number;
  isEditing: boolean;
  editForm: DetectedItemEditForm;
  onEditFormChange: (form: DetectedItemEditForm) => void;
  onStartEdit: (item: ClothingItem) => void;
  onSaveEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

/** A single row in the detection panel: thumbnail + inline-editable details. */
export const DetectedItemRow: React.FC<DetectedItemRowProps> = ({
  item,
  index,
  isEditing,
  editForm,
  onEditFormChange,
  onStartEdit,
  onSaveEdit,
  onRemove,
}) => (
  <div
    className="group relative animate-in slide-in-from-bottom-4 duration-700"
    style={{ animationDelay: `${index * 100}ms` }}
  >
    <button
      onClick={() => onRemove(item.id)}
      aria-label={`Remove ${item.name}`}
      title="Remove item"
      className="absolute -top-1.5 -right-1.5 z-20 w-5 h-5 bg-white border border-stone-200 rounded-full flex items-center justify-center text-stone-400 hover:text-primary-600 hover:border-primary-600 transition-all opacity-0 group-hover:opacity-100 shadow-sm"
    >
      <X size={10} aria-hidden="true" />
    </button>
    <div className="flex gap-3 items-start">
      <div className="w-14 h-[4.5rem] flex-shrink-0 overflow-hidden bg-stone-100 relative">
        <img
          src={item.image}
          alt={item.name}
          className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
        />
        <div aria-hidden="true" className="absolute inset-0 ring-1 ring-inset ring-black/5" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {isEditing ? (
          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
              autoFocus
              placeholder="Item Name"
              aria-label="Item name"
              className="w-full font-serif italic text-base border-b border-primary-300 bg-transparent focus:outline-none focus:border-primary-500"
            />
            <div className="flex gap-2">
              <select
                value={editForm.category}
                onChange={(e) => onEditFormChange({ ...editForm, category: e.target.value as Category })}
                aria-label="Item category"
                className="w-1/2 text-[10px] font-bold uppercase tracking-widest border-b border-primary-300 bg-transparent focus:outline-none focus:border-primary-500 pb-0.5 cursor-pointer"
              >
                {EDITABLE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={editForm.color}
                onChange={(e) => onEditFormChange({ ...editForm, color: e.target.value })}
                placeholder="Color"
                aria-label="Item color"
                className="w-1/2 text-[10px] font-bold uppercase tracking-widest border-b border-primary-300 bg-transparent focus:outline-none focus:border-primary-500 pb-0.5"
              />
            </div>
            <button
              onClick={() => onSaveEdit(item.id)}
              className="text-primary-600 font-bold uppercase text-[10px] mt-1 text-left self-start flex items-center gap-1 hover:text-primary-800"
            >
              <Check size={12} aria-hidden="true" /> Save
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <h4
                onClick={() => onStartEdit(item)}
                className="font-serif text-base text-stone-900 italic cursor-pointer hover:text-primary-600 transition-colors"
              >
                {item.name}
              </h4>
              <button
                onClick={() => onStartEdit(item)}
                aria-label={`Edit ${item.name}`}
                title="Edit Details"
                className="text-stone-400 hover:text-primary-600 transition-colors p-0.5"
              >
                <Edit2 size={12} aria-hidden="true" />
              </button>
            </div>
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
              {item.category}
            </p>
          </>
        )}
      </div>
    </div>
  </div>
);
