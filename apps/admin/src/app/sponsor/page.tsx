'use client';

import React, { useState, useEffect } from 'react';
import {
  SponsorshipStatusResponseDto,
  SponsoredTxRecord,
  SponsorshipHealthStatus,
  UpdateSponsorshipConfigDto,
} from '@gateflow/shared-types';
import { AdminApiClient } from '@/lib/api';
import {
  Fuel,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  Settings,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  TrendingUp,
  Sliders,
  X,
  Lock,
} from 'lucide-react';

export default function SponsorGasStationPage() {
  const [statusData, setStatusData] = useState<SponsorshipStatusResponseDto | null>(null);
  const [history, setHistory] = useState<SponsoredTxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedTx, setCopiedTx] = useState<string | null>(null);

  // Edit config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState<UpdateSponsorshipConfigDto>({
    maxFeeStroopsPerTx: 500000,
    hourlySpendCapStroops: 5000000,
    dailySpendCapStroops: 25000000,
    minBalanceAlertXlm: 10.0,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        AdminApiClient.getSponsorshipStatus(),
        AdminApiClient.getSponsoredHistory(50, 0),
      ]);
      setStatusData(statusRes);
      setHistory(historyRes.records);
      if (statusRes.metrics?.guardConfig) {
        setConfigForm({
          maxFeeStroopsPerTx: statusRes.metrics.guardConfig.maxFeeStroopsPerTx,
          hourlySpendCapStroops: statusRes.metrics.guardConfig.hourlySpendCapStroops,
          dailySpendCapStroops: statusRes.metrics.guardConfig.dailySpendCapStroops,
          minBalanceAlertXlm: statusRes.metrics.guardConfig.minBalanceAlertXlm,
          enabled: statusRes.metrics.guardConfig.enabled,
        });
      }
    } catch (err) {
      console.error('Failed to load sponsorship data:', err);
    } finally {
      setLoading(false);
    }
  }

  function copyText(text: string, isKey = false, txId?: string) {
    navigator.clipboard.writeText(text);
    if (isKey) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (txId) {
      setCopiedTx(txId);
      setTimeout(() => setCopiedTx(null), 2000);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await AdminApiClient.updateSponsorshipConfig(configForm);
      setShowConfigModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Failed to update spending guards: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  }

  const metrics = statusData?.metrics;
  const balance = statusData?.balance;
  const guardConfig = metrics?.guardConfig;

  const dailyCapXlm = (guardConfig?.dailySpendCapStroops || 25000000) / 10000000;
  const hourlyCapXlm = (guardConfig?.hourlySpendCapStroops || 5000000) / 10000000;
  const maxFeePerTxXlm = (guardConfig?.maxFeeStroopsPerTx || 500000) / 10000000;

  const dailyUsagePercent = Math.min(
    100,
    Math.round(((metrics?.totalSpendXlm || 0) / (dailyCapXlm || 1)) * 100)
  );
  const hourlyUsagePercent = Math.min(
    100,
    Math.round(((metrics?.hourlySpendXlm || 0) / (hourlyCapXlm || 1)) * 100)
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Fuel className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Gas Station & Spending Guards</h1>
              <p className="text-sm text-slate-400">
                Stellar Soroban fee-bump sponsorship engine with velocity limits, balance monitors, and smart fraud guards
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors border border-slate-700"
          >
            <Sliders className="h-4 w-4 text-emerald-400" />
            Configure Guards
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors border border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sponsor Account & Balance Overview */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Sponsor Treasury Account
            </span>
            <div className="flex items-center gap-2 mt-1.5 font-mono text-sm text-emerald-400 font-semibold break-all">
              <span>{balance?.publicKey || 'GSPONSOR...GATEFLOW'}</span>
              <button
                onClick={() => copyText(balance?.publicKey || '', true)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy Sponsor Public Key"
              >
                {copiedKey ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
              <a
                href={`https://stellar.expert/explorer/testnet/account/${balance?.publicKey}`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-500 hover:text-emerald-400 transition-colors"
                title="View on Stellar Expert"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Health Status Badge */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
                metrics?.healthStatus === 'HEALTHY'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : metrics?.healthStatus === 'WARNING_LOW_BALANCE'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  metrics?.healthStatus === 'HEALTHY'
                    ? 'bg-emerald-400 animate-pulse'
                    : metrics?.healthStatus === 'WARNING_LOW_BALANCE'
                    ? 'bg-amber-400'
                    : 'bg-red-400 animate-ping'
                }`}
              />
              <span>
                {metrics?.healthStatus === 'HEALTHY'
                  ? 'System Healthy & Funded'
                  : metrics?.healthStatus === 'WARNING_LOW_BALANCE'
                  ? 'Warning: Low Balance Threshold'
                  : 'Critical: Spending Cap Reached'}
              </span>
            </div>
          </div>
        </div>

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-750 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Sponsor Balance</span>
              <Coins className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {balance?.balanceXlm.toFixed(3)} <span className="text-sm font-normal text-slate-400">XLM</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Min Alert Level: {guardConfig?.minBalanceAlertXlm.toFixed(1)} XLM
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-750 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Spent Today (24h)</span>
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {metrics?.totalSpendXlm.toFixed(4)} <span className="text-sm font-normal text-slate-400">XLM</span>
            </div>
            <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all"
                style={{ width: `${dailyUsagePercent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {dailyUsagePercent}% of {dailyCapXlm.toFixed(2)} XLM daily cap
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-750 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Rolling Hourly Spend</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {metrics?.hourlySpendXlm.toFixed(4)} <span className="text-sm font-normal text-slate-400">XLM</span>
            </div>
            <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className="bg-amber-400 h-full rounded-full transition-all"
                style={{ width: `${hourlyUsagePercent}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {hourlyUsagePercent}% of {hourlyCapXlm.toFixed(2)} XLM hourly cap
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-750 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Sponsored Transactions</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white">{metrics?.txCount || 0}</div>
            <p className="text-[11px] text-slate-500">
              Avg Fee: {metrics && metrics.txCount > 0 ? (metrics.totalSpendXlm / metrics.txCount).toFixed(5) : '0.01000'} XLM
            </p>
          </div>
        </div>
      </div>

      {/* Active Spending Guards Security Policy Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Lock className="h-4 w-4 text-emerald-400" />
            Per-Transaction Fee Ceiling
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Every incoming transaction is inspected before fee wrapping. Any request requiring more than{' '}
            <strong className="text-white">{maxFeePerTxXlm.toFixed(3)} XLM</strong> ({guardConfig?.maxFeeStroopsPerTx} stroops) is automatically blocked.
          </p>
          <div className="text-xs font-mono text-emerald-400 bg-slate-800/60 p-2 rounded border border-slate-750">
            Rule: fee &le; {guardConfig?.maxFeeStroopsPerTx} stroops
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Contract Whitelisting Guard
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            The sponsor account will only sign transactions invoking verified Soroban contracts (Core, Attendance, and Visitors). Arbitrary transfers or foreign contracts are rejected.
          </p>
          <div className="text-xs font-mono text-slate-300 bg-slate-800/60 p-2 rounded border border-slate-750 truncate">
            Allowed: GateFlow Core, Attendance, Visitors
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Velocity Circuit Breaker
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            If anomalous transaction bursts exceed the rolling {hourlyCapXlm.toFixed(2)} XLM/hr or {dailyCapXlm.toFixed(2)} XLM/day budgets, the circuit breaker halts fee bumps to protect treasury funds.
          </p>
          <div className="text-xs font-mono text-amber-400 bg-slate-800/60 p-2 rounded border border-slate-750">
            Hourly: {hourlyCapXlm} XLM &middot; Daily: {dailyCapXlm} XLM
          </div>
        </div>
      </div>

      {/* Sponsored Transactions Stream */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Sponsored Transactions Log</h2>
            <p className="text-xs text-slate-400">
              Live audit trail of fee-bump transactions submitted to the Stellar Soroban network
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Total Logged: {history.length}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No sponsored fee-bump transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-6">Timestamp</th>
                  <th className="py-3 px-6">Operation</th>
                  <th className="py-3 px-6">Fee Sponsored</th>
                  <th className="py-3 px-6">Inner TX</th>
                  <th className="py-3 px-6">Fee-Bump TX Hash</th>
                  <th className="py-3 px-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {history.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-6 text-slate-300 font-mono">
                      {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-3.5 px-6 font-semibold text-white">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700/60 font-mono text-[11px]">
                        {tx.operationType}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-slate-300">
                      {tx.feeXlm.toFixed(4)} XLM
                      <span className="text-[10px] text-slate-500 block">
                        ({tx.feeStroops.toLocaleString()} stroops)
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-slate-400">
                      {tx.innerTxHash ? (
                        <div className="flex items-center gap-1.5">
                          <span>{tx.innerTxHash.slice(0, 8)}...{tx.innerTxHash.slice(-6)}</span>
                          <button
                            onClick={() => copyText(tx.innerTxHash!, false, `inner-${tx.id}`)}
                            className="text-slate-500 hover:text-white"
                          >
                            {copiedTx === `inner-${tx.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3.5 px-6 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400">
                          {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-6)}
                        </span>
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-white"
                          title="View on Stellar Expert"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Confirmed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Guards Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Sliders className="h-5 w-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Configure Spending Guards</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Max Fee Per Transaction (Stroops)
                </label>
                <input
                  type="number"
                  min="1000"
                  max="10000000"
                  value={configForm.maxFeeStroopsPerTx}
                  onChange={(e) =>
                    setConfigForm((prev) => ({
                      ...prev,
                      maxFeeStroopsPerTx: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {(Number(configForm.maxFeeStroopsPerTx || 0) / 10000000).toFixed(4)} XLM max per tx
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Hourly Spend Cap (Stroops)
                </label>
                <input
                  type="number"
                  min="10000"
                  value={configForm.hourlySpendCapStroops}
                  onChange={(e) =>
                    setConfigForm((prev) => ({
                      ...prev,
                      hourlySpendCapStroops: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {(Number(configForm.hourlySpendCapStroops || 0) / 10000000).toFixed(2)} XLM / hour
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Daily Spend Cap (Stroops)
                </label>
                <input
                  type="number"
                  min="50000"
                  value={configForm.dailySpendCapStroops}
                  onChange={(e) =>
                    setConfigForm((prev) => ({
                      ...prev,
                      dailySpendCapStroops: parseInt(e.target.value, 10),
                    }))
                  }
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {(Number(configForm.dailySpendCapStroops || 0) / 10000000).toFixed(2)} XLM / day
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Low Balance Alert Threshold (XLM)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  value={configForm.minBalanceAlertXlm}
                  onChange={(e) =>
                    setConfigForm((prev) => ({
                      ...prev,
                      minBalanceAlertXlm: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-semibold text-sm transition-colors"
                >
                  {savingConfig ? 'Saving...' : 'Save Guards Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
