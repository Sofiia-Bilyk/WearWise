import React, { useState } from 'react';
import { X } from 'lucide-react';

interface PostponeModalProps {
  onConfirm: (date: string) => void;
  onClose: () => void;
}

export const PostponeModal: React.FC<PostponeModalProps> = ({ onConfirm, onClose }) => {
  const [postponeDate, setPostponeDate] = useState('');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-xl font-serif italic text-stone-900">Postpone Reminder</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-sm text-stone-500 italic">When should we remind you about this piece again?</p>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Remind me on</label>
            <input
              type="date"
              value={postponeDate}
              onChange={(e) => setPostponeDate(e.target.value)}
              className="w-full bg-transparent border-b border-stone-200 py-2 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>
          <button
            onClick={() => { if (postponeDate) onConfirm(postponeDate); }}
            disabled={!postponeDate}
            className="w-full py-3 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-600 transition-colors rounded-xl disabled:opacity-50"
          >
            Confirm Postpone
          </button>
        </div>
      </div>
    </div>
  );
};
