'use client';

import React, { useState, useEffect } from 'react';
import {
  QrCode,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  LogIn,
  LogOut,
  UserPlus,
  Clock,
  Building2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AdminApiClient } from '@/lib/api';
import {
  SiteResponseDto,
  GateVerifyPassResponseDto,
  GateLog,
  PassStatus,
  GateEventType,
} from '@gateflow/shared-types';

export default function GateTerminalPage() {
  const [sites, setSites] = useState<SiteResponseDto[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [passInput, setPassInput] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<GateVerifyPassResponseDto | null>(null);
  const [gateLogs, setGateLogs] = useState<GateLog[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Walk-in modal
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInEmail, setWalkInEmail] = useState('');
  const [walkInCompany, setWalkInCompany] = useState('');
  const [walkInPurpose, setWalkInPurpose] = useState('');

  useEffect(() => {
    loadSitesAndLogs();
  }, []);

  async function loadSitesAndLogs() {
    try {
      const siteList = await AdminApiClient.getSites();
      setSites(siteList);
      if (siteList.length > 0 && !selectedSiteId) {
        setSelectedSiteId(siteList[0].site.id);
        const logs = await AdminApiClient.getGateLogs(siteList[0].site.id);
        setGateLogs(logs);
      }
    } catch (err: any) {
      console.warn(err.message);
    }
  }

  async function handleSiteChange(siteId: string) {
    setSelectedSiteId(siteId);
    setVerifyResult(null);
    try {
      const logs = await AdminApiClient.getGateLogs(siteId);
      setGateLogs(logs);
    } catch (err: any) {
      console.warn(err.message);
    }
  }

  async function handleVerify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!passInput.trim() || !selectedSiteId) return;

    setIsVerifying(true);
    setFeedback(null);
    try {
      const result = await AdminApiClient.verifyGatePass({
        passIdOrQrToken: passInput.trim(),
        siteId: selectedSiteId,
      });
      setVerifyResult(result);
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleRecordEntry() {
    if (!verifyResult?.pass || !selectedSiteId) return;
    try {
      const log = await AdminApiClient.recordGateEntry({
        passIdOrQrToken: verifyResult.pass.id,
        siteId: selectedSiteId,
        notes: 'Verified and admitted at main barrier',
      });
      setFeedback({
        message: `Entry recorded for ${verifyResult.pass.visitor?.name || 'Visitor'}!`,
        type: 'success',
      });
      setGateLogs([log, ...gateLogs]);
      setVerifyResult(null);
      setPassInput('');
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  }

  async function handleRecordExit() {
    if (!verifyResult?.pass || !selectedSiteId) return;
    try {
      const log = await AdminApiClient.recordGateExit({
        passIdOrQrToken: verifyResult.pass.id,
        siteId: selectedSiteId,
        notes: 'Departed site via security exit turnstile',
      });
      setFeedback({
        message: `Exit recorded for ${verifyResult.pass.visitor?.name || 'Visitor'}!`,
        type: 'success',
      });
      setGateLogs([log, ...gateLogs]);
      setVerifyResult(null);
      setPassInput('');
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  }

  async function handleWalkInSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSiteId) return;

    try {
      const pass = await AdminApiClient.registerWalkIn({
        name: walkInName,
        email: walkInEmail,
        company: walkInCompany || undefined,
        purpose: walkInPurpose,
        hostId: 'host-1',
        siteId: selectedSiteId,
        durationHours: 4,
      });

      setShowWalkInModal(false);
      setWalkInName('');
      setWalkInEmail('');
      setWalkInCompany('');
      setWalkInPurpose('');
      setFeedback({
        message: `Walk-in visitor pass generated on-chain! Pass ID: ${pass.passIdHash.slice(0, 16)}...`,
        type: 'success',
      });

      // Auto-load into scanner
      setPassInput(pass.id);
      const res = await AdminApiClient.verifyGatePass({
        passIdOrQrToken: pass.id,
        siteId: selectedSiteId,
      });
      setVerifyResult(res);
    } catch (err: any) {
      setFeedback({ message: err.message, type: 'error' });
    }
  }

  const selectedSite = sites.find((s) => s.site.id === selectedSiteId);

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <QrCode className="h-7 w-7 text-emerald-400" />
            Security Guard Gate Terminal
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time barcode / QR / Pass ID verification directly checking Soroban smart contract state.
          </p>
        </div>

        {/* Site selector & walk-in */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
            <Building2 className="h-4 w-4 text-emerald-400" />
            <select
              value={selectedSiteId}
              onChange={(e) => handleSiteChange(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none"
            >
              {sites.map((s) => (
                <option key={s.site.id} value={s.site.id} className="bg-slate-900">
                  {s.site.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowWalkInModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-sm font-semibold transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Walk-in Visitor
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
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            {feedback.message}
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Terminal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner & Verification Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
                Gate Verification Scanner
              </h2>
              <span className="text-xs text-slate-400">
                Gate location: {selectedSite?.site.name || 'Select a site'}
              </span>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Soroban Live
            </span>
          </div>

          {/* Input form */}
          <form onSubmit={handleVerify} className="space-y-3">
            <label className="text-xs text-slate-400 block">Scan Barcode / QR Token / Enter Pass ID</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Paste QR payload or Pass ID..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isVerifying || !passInput.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold text-sm transition-colors"
              >
                {isVerifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Accepts 32-byte hex pass hashes, base64url signed QR tokens, or database pass UUIDs.
            </p>
          </form>

          {/* Verification Result Card */}
          {verifyResult && (
            <div
              className={`rounded-xl p-5 border transition-all ${
                verifyResult.valid
                  ? 'bg-emerald-950/20 border-emerald-500/40'
                  : 'bg-rose-950/20 border-rose-500/40'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {verifyResult.valid ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  ) : (
                    <XCircle className="h-6 w-6 text-rose-400" />
                  )}
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {verifyResult.valid ? 'Access Approved' : 'Access Denied'}
                    </h3>
                    <p className="text-xs text-slate-400">{verifyResult.message}</p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    verifyResult.valid
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {verifyResult.onchainStatus || verifyResult.status}
                </span>
              </div>

              {verifyResult.pass && (
                <div className="space-y-3 bg-slate-900/80 p-4 rounded-lg border border-slate-800 text-sm">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Visitor:</span>
                      <p className="font-semibold text-white">{verifyResult.pass.visitor?.name || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Company:</span>
                      <p className="text-slate-300">{verifyResult.pass.visitor?.company || 'None'}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Assigned Site:</span>
                      <p className="text-slate-300">{verifyResult.siteName || verifyResult.pass.siteId}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Valid Until:</span>
                      <p className="text-slate-300">
                        {new Date(verifyResult.pass.validUntil).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  {verifyResult.pass.passIdHash && (
                    <div className="text-[11px] font-mono text-slate-500 break-all pt-2 border-t border-slate-800">
                      Soroban Pass Hash: {verifyResult.pass.passIdHash}
                    </div>
                  )}

                  {/* Gate Action Buttons */}
                  {verifyResult.valid && (
                    <div className="flex gap-3 pt-3 border-t border-slate-800">
                      <button
                        onClick={handleRecordEntry}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm transition-colors shadow-lg shadow-emerald-500/20"
                      >
                        <LogIn className="h-4 w-4" />
                        Record Gate Entry
                      </button>
                      <button
                        onClick={handleRecordExit}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Record Gate Exit
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Real-time Gate Activity Log */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-400" />
              Live Gate Activity Log
            </h2>
            <button
              onClick={() => handleSiteChange(selectedSiteId)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
            {gateLogs.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No gate logs recorded yet for this site.</p>
            ) : (
              gateLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between bg-slate-800/40 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        log.type === GateEventType.ENTRY
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {log.type === GateEventType.ENTRY ? (
                        <LogIn className="h-4 w-4" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {log.pass?.visitor?.name || 'Authorized Visitor'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {log.type === GateEventType.ENTRY ? 'Entered Site' : 'Departed Site'} •{' '}
                        {log.site?.name || 'Gate'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-300 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(log.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Walk-in Visitor Modal */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-emerald-400" />
              Kiosk Walk-In Visitor Registration
            </h2>
            <p className="text-xs text-slate-400">
              Issues an instantaneous 4-hour guest pass anchored onto the Soroban smart contract.
            </p>

            <form onSubmit={handleWalkInSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Visitor Full Name</label>
                <input
                  type="text"
                  required
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="e.g. David Miller"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={walkInEmail}
                  onChange={(e) => setWalkInEmail(e.target.value)}
                  placeholder="david@contractor.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Company (Optional)</label>
                <input
                  type="text"
                  value={walkInCompany}
                  onChange={(e) => setWalkInCompany(e.target.value)}
                  placeholder="Miller Electrical Services"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Reason / Purpose of Visit</label>
                <input
                  type="text"
                  required
                  value={walkInPurpose}
                  onChange={(e) => setWalkInPurpose(e.target.value)}
                  placeholder="Urgent electrical inspection"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition-colors"
                >
                  Generate Pass & Scan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
