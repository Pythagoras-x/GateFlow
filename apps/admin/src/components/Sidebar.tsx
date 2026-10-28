'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Users,
  Clock,
  ShieldCheck,
  FileCheck2,
  UserCheck,
  QrCode,
  BarChart3,
  History,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Sites', href: '/sites', icon: Building2 },
  { name: 'Employees', href: '/employees', icon: Users },
  { name: 'Attendance', href: '/attendance', icon: Clock },
  { name: 'Reports & Payroll', href: '/reports', icon: BarChart3 },
  { name: 'Visitors & Passes', href: '/visitors', icon: UserCheck },
  { name: 'Gate Terminal', href: '/gate', icon: QrCode },
  { name: 'Anchors (On-chain)', href: '/anchors', icon: ShieldCheck },
  { name: 'Audit Trail', href: '/audit', icon: History },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col border-r border-slate-800">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-900 text-xl">
          G
        </div>
        <div>
          <span className="font-bold text-lg text-white">GateFlow</span>
          <span className="block text-xs text-emerald-400">Stellar Soroban</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Stellar Testnet Connected
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Soroban smart contracts active. Merkle proofs verified on-chain.
          </p>
        </div>
      </div>
    </aside>
  );
}
