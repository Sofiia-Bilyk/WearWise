import React from 'react';
import { Camera, Sparkles, CheckCircle2 } from 'lucide-react';

export const InstructionsView: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-6 py-4 h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      <div className="text-center mb-5">
        <h1 className="text-2xl font-serif italic text-stone-900 mb-1">How to use WearWise</h1>
        <p className="text-stone-500 font-serif italic text-sm max-w-2xl mx-auto">
          Master your wardrobe by tracking every look. Here's how to get the most out of your digital closet.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
        <div className="space-y-2">
          <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 shadow-sm">
            <Camera size={20} />
          </div>
          <h3 className="text-base font-bold text-stone-800">1. Capture Your Look</h3>
          <p className="text-stone-500 text-xs leading-relaxed">
            Stand in front of your camera for real-time detection or upload a photo.
            Our AI automatically identifies the pieces you're wearing.
          </p>
          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100 shadow-sm">
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Pro Tip</p>
            <p className="text-[11px] text-stone-600 italic leading-relaxed">
              Use natural lighting and a clear background for accurate detection.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 shadow-sm">
            <Sparkles size={20} />
          </div>
          <h3 className="text-base font-bold text-stone-800">2. Curate & Refine</h3>
          <p className="text-stone-500 text-xs leading-relaxed">
            Review the detected items. Manually add missing pieces,
            edit names, or remove items that aren't part of today's look.
          </p>
          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100 shadow-sm">
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">Best Photos</p>
            <p className="text-[11px] text-stone-600 italic leading-relaxed">
              Full-body shots work best. Ensure shoes and accessories are visible.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 shadow-sm">
            <CheckCircle2 size={20} />
          </div>
          <h3 className="text-base font-bold text-stone-800">3. Log & Learn</h3>
          <p className="text-stone-500 text-xs leading-relaxed">
            Hit "Log Entry" to save your outfit. This updates your wear counts
            and helps identify your "Forgotten Items" over time.
          </p>
          <div className="bg-stone-50 p-3 rounded-lg border border-stone-100 shadow-sm">
            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">The Goal</p>
            <p className="text-[11px] text-stone-600 italic leading-relaxed">
              Aim for 100% utilization by rediscovering pieces you haven't worn.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 p-6 bg-stone-900 rounded-2xl text-white overflow-hidden relative">
        <div className="relative z-10 max-w-2xl">
          <h2 className="text-xl font-serif italic mb-2">Ready to start?</h2>
          <p className="text-stone-400 text-xs mb-4 leading-relaxed">
            Your wardrobe is waiting to be rediscovered. Head over to the camera and log your first look.
          </p>
          <a
            href="#/"
            className="inline-block px-6 py-2.5 bg-primary-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-primary-600 transition-all shadow-xl shadow-primary-500/20"
          >
            Open Camera
          </a>
        </div>
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-l from-primary-500/50 to-transparent"></div>
          <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 text-primary-400 animate-pulse" />
        </div>
      </div>
    </div>
  );
};
