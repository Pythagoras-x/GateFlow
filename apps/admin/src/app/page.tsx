'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Building2,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { AdminApiClient } from '../lib/api';
import { AttendanceEvent, SiteResponseDto } from '@gateflow/shared-types';

export default function DashboardPage() {
  const [sitesCount, setSitesCount] = useState<number>(1);
  const [employeesCount, setEmployeesCount] = useState<number>(2);
  const [recentEvents, setRecentEvents] = useState<AttendanceEvent[]>([]);
  const [anchorsCount, setAnchorsCount] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [sites, emps, att, anchors] = await Promise.all([
          AdminApiClient.getSites(),
          AdminApiClient.getEmployees(),
          AdminApiClient.getAttendance(),
          AdminApiClient.getAnchors(),
        ]);
        setSitesCount(sites.length);
        setEmployeesCount(emps.length);
        setRecentEvents(att.events);
        setAnchorsCount(anchors.length);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-8 text-white relative overflow-hidden border border-slate-800 shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-3">
            Phase 1: MVP Active
          </span>
          <h2 className="text-3xl font-bold tracking-tight">
            Verifiable Attendance Anchored on Stellar
          </h2>
          <p className="mt-2 text-slate-300 text-sm leading-relaxed">
            Personal identifying details remain encrypted off-chain. Tamper-evident Merkle roots
            are submitted periodically to Soroban smart contracts on the Stellar network.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/anchors"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-sm inline-flex items-center gap-2 transition"
            >
              <ShieldCheck className="h-4 w-4" /> View On-chain Anchors
            </Link>
            <Link
              href="/attendance"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-sm inline-flex items-center gap-2 transition border border-slate-700"
            >
              <Clock className="h-4 w-4" /> Live Attendance
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Enrolled Employees</span>
            <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-4">{employeesCount}</p>
          <div className="flex items-center text-xs text-slate-500 mt-2 gap-1">
            <span className="text-emerald-600 font-semibold">100%</span> PII Encrypted
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Registered Sites</span>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-4">{sitesCount}</p>
          <div className="flex items-center text-xs text-emerald-600 font-medium mt-2 gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Synchronized on Soroban
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Attendance Events</span>
            <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-4">{recentEvents.length}</p>
          <div className="flex items-center text-xs text-slate-500 mt-2 gap-1">
            Single-use rotating QR verified
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">On-Chain Anchors</span>
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-4">{anchorsCount}</p>
          <div className="flex items-center text-xs text-emerald-600 font-medium mt-2 gap-1">
            Immutable & publicly verifiable
          </div>
        </div>
      </div>

      {/* Recent Attendance Activity */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Recent Attendance Records</h3>
            <p className="text-sm text-slate-500">Latest employee gate scans and check-in events</p>
          </div>
          <Link
            href="/attendance"
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1"
          >
            View all <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Site</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Timestamp</th>
                <th className="px-6 py-3 font-medium">Leaf Hash (Salted)</th>
                <th className="px-6 py-3 font-medium">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentEvents.map((event) => (
                <tr key={event.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {event.employee?.name || 'Employee'}
                    <span className="block text-xs text-slate-500 font-normal">
                      {event.employee?.employeeNo}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{event.site?.name || 'Headquarters'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        event.type === 'IN'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {event.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(event.occurredAt).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-500 truncate max-w-[180px]">
                    {event.leafHash}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">
                      {event.method}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
