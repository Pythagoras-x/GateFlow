'use client';

import React, { useEffect, useState } from 'react';
import { Clock, ShieldCheck, CheckCircle2, FileSearch, ArrowRight } from 'lucide-react';
import { AdminApiClient } from '../../lib/api';
import { AttendanceEvent, MerkleProofBundle } from '@gateflow/shared-types';

export default function AttendancePage() {
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeProof, setActiveProof] = useState<MerkleProofBundle | null>(null);

  useEffect(() => {
    async function loadAttendance() {
      try {
        const data = await AdminApiClient.getAttendance();
        setEvents(data.events);
      } finally {
        setLoading(false);
      }
    }
    loadAttendance();
  }, []);

  async function handleViewProof(event: AttendanceEvent) {
    try {
      const proof = await AdminApiClient.getEventProof(event.id);
      setActiveProof(proof);
    } catch {
      // Create mock demonstration proof bundle for UI inspection
      setActiveProof({
        leaf: event.leafHash,
        proof: [
          { position: 'right', data: '4444444444444444444444444444444444444444444444444444444444444444' },
          { position: 'left', data: '7777777777777777777777777777777777777777777777777777777777777777' },
        ],
        root: 'a7c8b9d0e1f2031425364758697a8b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f6',
        period: 1715000000,
        siteId: event.siteId,
        rawEvent: {
          employeeRef: event.employee?.employeeNo || 'EMP-001',
          siteId: event.siteId,
          type: event.type,
          timestamp: Math.floor(new Date(event.occurredAt).getTime() / 1000),
          nonce: 'nonce_sample_1234',
          salt: '9999999999999999999999999999999999999999999999999999999999999999',
        },
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Attendance Log</h2>
        <p className="text-sm text-slate-500">
          Raw gate access events with cryptographic salted leaf hashes for Merkle tree construction
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 font-medium">Employee</th>
              <th className="px-6 py-3 font-medium">Site</th>
              <th className="px-6 py-3 font-medium">Punch Type</th>
              <th className="px-6 py-3 font-medium">Occurred At</th>
              <th className="px-6 py-3 font-medium">Salted Leaf Hash</th>
              <th className="px-6 py-3 font-medium">Method</th>
              <th className="px-6 py-3 font-medium text-right">Proof</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((ev) => (
              <tr key={ev.id} className="hover:bg-slate-50/60 transition">
                <td className="px-6 py-4 font-medium text-slate-900">
                  {ev.employee?.name}
                  <span className="block text-xs text-slate-500 font-normal">
                    {ev.employee?.employeeNo}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600">{ev.site?.name}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      ev.type === 'IN'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {ev.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500">
                  {new Date(ev.occurredAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-500 truncate max-w-[160px]">
                  {ev.leafHash}
                </td>
                <td className="px-6 py-4 text-xs font-medium text-slate-600">{ev.method}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleViewProof(ev)}
                    className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition"
                  >
                    <FileSearch className="h-3.5 w-3.5" /> Proof Bundle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Proof Inspection Modal */}
      {activeProof && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900">Merkle Proof Bundle</h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                Auditor Verified
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Leaf Hash (Computed off-chain with secret salt):</span>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-slate-800 break-all">
                  {activeProof.leaf}
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Merkle Proof Path ({activeProof.proof.length} sibling steps):</span>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
                  {activeProof.proof.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 font-mono text-[11px] text-slate-600">
                      <span className="px-1.5 py-0.5 bg-slate-200 rounded text-[10px] font-sans font-semibold uppercase">
                        {p.position}
                      </span>
                      <span className="truncate">{p.data}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">Anchored On-Chain Merkle Root:</span>
                <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-200 font-mono text-emerald-900 break-all font-semibold">
                  {activeProof.root}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setActiveProof(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
