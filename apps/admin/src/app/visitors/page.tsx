'use client';

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Plus,
  ShieldCheck,
  KeyRound,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Copy,
  Clock,
  Building2,
  Trash2,
} from 'lucide-react';
import { AdminApiClient } from '@/lib/api';
import {
  Visitor,
  VisitorPass,
  SiteResponseDto,
  PassStatus,
  VisitorStatus,
} from '@gateflow/shared-types';

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [passes, setPasses] = useState<VisitorPass[]>([]);
  const [sites, setSites] = useState<SiteResponseDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [durationHours, setDurationHours] = useState('8');

  // Notification
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [visList, passList, siteList] = await Promise.all([
        AdminApiClient.getVisitors(),
        AdminApiClient.getPasses(),
        AdminApiClient.getSites(),
      ]);
      setVisitors(visList);
      setPasses(passList);
      setSites(siteList);
      if (siteList.length > 0 && !selectedSiteId) {
        setSelectedSiteId(siteList[0].site.id);
      }
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateVisitor(e: React.FormEvent) {
    e.preventDefault();
    try {
      const newVis = await AdminApiClient.createVisitor({
        name,
        email,
        phone: phone || undefined,
        company: company || undefined,
        purpose,
      });
      setVisitors([newVis, ...visitors]);
      setShowVisitorModal(false);
      setName('');
      setEmail('');
      setPhone('');
      setCompany('');
      setPurpose('');
      setFeedback({ message: `Visitor ${newVis.name} registered (PII encrypted with AES-256-GCM)`, type: 'success' });
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  }

  async function handleIssuePass(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVisitor) return;

    try {
      const now = new Date();
      const validUntil = new Date(now.getTime() + parseInt(durationHours, 10) * 3600 * 1000);

      const pass = await AdminApiClient.issuePass({
        visitorId: selectedVisitor.id,
        siteId: selectedSiteId,
        validFrom: now.toISOString(),
        validUntil: validUntil.toISOString(),
      });

      setPasses([pass, ...passes]);
      setShowPassModal(false);
      setSelectedVisitor(null);
      setFeedback({
        message: `On-chain pass issued! Tx: ${pass.onchainTxHash?.slice(0, 16)}...`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  }

  async function handleRevokePass(passId: string) {
    if (!confirm('Are you sure you want to revoke this visitor pass immediately on-chain?')) return;
    try {
      const updated = await AdminApiClient.revokePass(passId, 'Admin manual revocation');
      setPasses(passes.map((p) => (p.id === passId ? updated : p)));
      setFeedback({ message: 'Pass successfully revoked on Soroban smart contract', type: 'success' });
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  }

  function getStatusBadge(status: PassStatus | string) {
    switch (status) {
      case PassStatus.ISSUED:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>;
      case PassStatus.ENTERED:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Entered</span>;
      case PassStatus.EXITED:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">Exited</span>;
      case PassStatus.REVOKED:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Revoked</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">{status}</span>;
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <UserCheck className="h-7 w-7 text-emerald-400" />
            Visitor Management & On-Chain Passes
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Pre-register visitors with off-chain PII encryption. Passes are anchored on Stellar Soroban with time bounds.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowVisitorModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Plus className="h-4 w-4" />
            Pre-register Visitor
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400" />
            )}
            {feedback.message}
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Grid: Passes and Visitors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visitors column */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              Pre-Registered Visitors ({visitors.length})
            </h2>
            <span className="text-[11px] text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              AES-256 PII
            </span>
          </div>

          <div className="space-y-3">
            {visitors.map((v) => (
              <div
                key={v.id}
                className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white text-sm">{v.name}</h3>
                    <p className="text-xs text-slate-400">{v.email}</p>
                    {v.company && (
                      <span className="inline-block mt-1 text-[11px] text-slate-300 bg-slate-700/60 px-1.5 py-0.5 rounded">
                        {v.company}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedVisitor(v);
                      setShowPassModal(true);
                    }}
                    className="px-2.5 py-1 text-xs rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                  >
                    Issue Pass
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">Purpose:</span> {v.purpose}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Passes Column */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Stellar Soroban Passes ({passes.length})
            </h2>
            <span className="text-xs text-slate-400">Time-bound access tokens</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/60 text-xs text-slate-400 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Visitor</th>
                  <th className="py-2.5 px-3">Site</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Validity</th>
                  <th className="py-2.5 px-3">Pass Hash / On-Chain</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {passes.map((pass) => (
                  <tr key={pass.id} className="hover:bg-slate-800/30">
                    <td className="py-3 px-3">
                      <div className="font-medium text-white">{pass.visitor?.name || 'Unknown'}</div>
                      <div className="text-xs text-slate-400">{pass.visitor?.company || pass.visitor?.email}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-300">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        {pass.site?.name || pass.siteId}
                      </div>
                    </td>
                    <td className="py-3 px-3">{getStatusBadge(pass.status)}</td>
                    <td className="py-3 px-3">
                      <div className="text-xs text-slate-300 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {new Date(pass.validUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(pass.validFrom).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono text-[11px] text-slate-400 max-w-[140px] truncate">
                        {pass.passIdHash}
                      </div>
                      {pass.onchainTxHash && (
                        <span className="text-[10px] text-emerald-400 font-mono">
                          Tx: {pass.onchainTxHash.slice(0, 10)}...
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {pass.status !== PassStatus.REVOKED && pass.status !== PassStatus.EXITED && (
                        <button
                          onClick={() => handleRevokePass(pass.id)}
                          className="px-2 py-1 text-xs rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                          title="Revoke pass on-chain"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pre-register Visitor Modal */}
      {showVisitorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-400" />
              Pre-register Visitor
            </h2>
            <p className="text-xs text-slate-400">
              Personal identifiable information is encrypted before database persistence using AES-256-GCM.
            </p>

            <form onSubmit={handleCreateVisitor} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Elena Rostova"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="elena@example.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Company / Organization</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Industries"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Purpose of Visit</label>
                <input
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. SLA Audit, Vendor Meeting"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowVisitorModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition-colors"
                >
                  Register Visitor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Pass Modal */}
      {showPassModal && selectedVisitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Issue Pass for {selectedVisitor.name}
            </h2>
            <p className="text-xs text-slate-400">
              This triggers a Soroban transaction to anchor the pass hash and validity window on-chain.
            </p>

            <form onSubmit={handleIssuePass} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Target Site</label>
                <select
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {sites.map((s) => (
                    <option key={s.site.id} value={s.site.id}>
                      {s.site.name} ({s.site.timezone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Pass Duration</label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="2">2 Hours</option>
                  <option value="4">4 Hours (Half Day)</option>
                  <option value="8">8 Hours (Full Day)</option>
                  <option value="24">24 Hours (Day Pass)</option>
                  <option value="72">3 Days (Contractor)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPassModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition-colors"
                >
                  Anchor & Issue Pass
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
