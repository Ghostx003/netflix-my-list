import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { PredefinedDropReason, PREDEFINED_DROP_REASONS } from '../types';

interface DropReasonModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => void;
}

export const DropReasonModal: React.FC<DropReasonModalProps> = ({
  isOpen,
  title,
  onClose,
  onConfirm,
}) => {
  const [selectedReason, setSelectedReason] = useState<PredefinedDropReason>('Too boring');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(selectedReason, notes.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-zinc-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-red-500/20 text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Drop Title</h3>
            <p className="text-sm text-red-300 font-medium line-clamp-1">{title}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
              Why did you drop this?<span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
              {PREDEFINED_DROP_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedReason === reason
                      ? 'bg-red-600/20 border-red-500 text-white font-semibold'
                      : 'bg-black/30 border-white/5 text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="dropReason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="text-red-600 focus:ring-red-500 bg-neutral-800 border-white/20"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              Reason Details / Notes (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Too slow after Season 3. Lost interest in the main plot."
              className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 transition-all"
            >
              Drop Title
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
