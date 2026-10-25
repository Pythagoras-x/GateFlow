'use client';

import React from 'react';
import { Shield, Bell } from 'lucide-react';

export function Navbar() {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-slate-800">
          Workforce & Access Management
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Shield className="h-3.5 w-3.5" />
          Role: Admin
        </span>

        <div className="h-8 w-px bg-slate-200" />

        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-slate-800 text-white font-medium flex items-center justify-center text-sm">
            AD
          </div>
          <div className="text-sm text-left">
            <span className="block font-medium text-slate-800">Administrator</span>
            <span className="block text-xs text-slate-500">admin@gateflow.example</span>
          </div>
        </div>
      </div>
    </header>
  );
}
