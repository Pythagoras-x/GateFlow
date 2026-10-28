'use client';

import React, { useState, useEffect } from 'react';
import { AdminApiClient } from '@/lib/api';
import { AuditLog, AuditVerificationResult, AuditVerificationStatus } from '@gateflow/shared-types';
import {
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Download,
  Search,
  CheckCircle2,
  FileText,
  Hash,
} from 'lucide-react';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [verification, setVerification] = useState<AuditVerificationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await AdminApiClient.getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const result = await AdminApiClient.verifyAuditChain();
      setVerification(result);
    } catch (err: any) {
      setVerification({
        valid: false,
        status: AuditVerificationStatus.CORRUPTED,
        totalEntries: logs.length,
        message: err.message || 'Verification failed',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = (format: 'json' | 'csv') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } else {
      const headers = ['id', 'actorId', 'action', 'entity', 'prevHash', 'entryHash', 'createdAt', 'payload'];
      const rows = logs.map((l) => [
        `"${l.id}"`,
        `"${l.actorId}"`,
        `"${l.action}"`,
        `"${l.entity}"`,
        `"${l.prevHash || ''}"`,
        `"${l.entryHash}"`,
        `"${l.createdAt}"`,
        `"${JSON.stringify(l.payload).replace(/"/g, '""')}"`,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    }
  };

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.actorId.toLowerCase().includes(search.toLowerCase()) ||
      l.entity.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-emerald-400" />
            Cryptographic Audit Trail
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Tamper-evident, hash-chained log of all organizational operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Verifying Chain...' : 'Verify Hash Chain'}
          </button>

          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>

          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700"
          >
            <FileText className="h-4 w-4" />
            JSON
          </button>
        </div>
      </div>

      {/* Verification Banner */}
      {verification && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-4 transition-all ${
            verification.valid
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
          }`}
        >
          {verification.valid ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-semibold text-base">
              {verification.valid
                ? 'Cryptographic Audit Chain Intact'
                : 'Audit Chain Tampering / Corruption Detected!'}
            </div>
            <p className="text-sm mt-1 opacity-90">{verification.message}</p>
            {verification.brokenAtIndex !== undefined && (
              <div className="mt-2 text-xs font-mono bg-black/30 p-2 rounded border border-rose-500/20">
                Corrupted Block: #{verification.brokenAtIndex} | Entry ID:{' '}
                {verification.brokenEntryId}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter and stats */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by action, actor, or entity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Total Recorded Entries: <span className="text-white font-bold">{logs.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800/60 text-slate-400 font-medium text-xs border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Actor</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Entity</th>
              <th className="py-3 px-4">SHA-256 Link Preview</th>
              <th className="py-3 px-4 text-right">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500">
                  Loading audit trail...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500">
                  No matching audit logs found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-300">{log.actorId}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{log.entity}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Hash className="h-3 w-3 text-slate-500" />
                      <span className="text-slate-500">
                        {log.prevHash ? log.prevHash.slice(0, 8) : '00000000'}...
                      </span>
                      <span className="text-slate-600">→</span>
                      <span className="text-emerald-400 font-semibold">
                        {log.entryHash.slice(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedPayload(log.payload)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payload Modal */}
      {selectedPayload && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Audit Entry Payload</h3>
              <button
                onClick={() => setSelectedPayload(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕ Close
              </button>
            </div>
            <pre className="bg-slate-950 p-4 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto max-h-80 border border-slate-800">
              {JSON.stringify(selectedPayload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
