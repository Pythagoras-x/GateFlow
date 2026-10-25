'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Play, CheckCircle2, ExternalLink, Calendar, Hash } from 'lucide-react';
import { AdminApiClient } from '../../lib/api';
import { AnchorRecord, SiteResponseDto } from '@gateflow/shared-types';

export default function AnchorsPage() {
  const [anchors, setAnchors] = useState<AnchorRecord[]>([]);
  const [sites, setSites] = useState<SiteResponseDto[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [running, setRunning] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  async function loadData() {
    try {
      const [anchorData, siteData] = await Promise.all([
        AdminApiClient.getAnchors(),
        AdminApiClient.getSites(),
      ]);
      setAnchors(anchorData);
      setSites(siteData);
      if (siteData.length > 0 && !selectedSiteId) {
        setSelectedSiteId(siteData[0].site.id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleTriggerAnchor() {
    if (!selectedSiteId) return;
    setRunning(true);
    try {
      await AdminApiClient.runAnchoring(selectedSiteId);
      await loadData();
      alert('Anchoring run completed successfully! Merkle root submitted on-chain.');
    } catch (err: any) {
      alert(err.message || 'Anchoring run failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">On-Chain Anchors</h2>
          <p className="text-sm text-slate-500">
            Immutable 32-byte Merkle roots anchored to the Soroban smart contract on Stellar Testnet
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {sites.map(({ site }) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleTriggerAnchor}
            disabled={running || !selectedSiteId}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm inline-flex items-center gap-2 transition disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {running ? 'Submitting to Stellar...' : 'Trigger Anchoring Run'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {anchors.map((anchor) => (
          <div
            key={anchor.id}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    Anchor Record
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                      {anchor.status}
                    </span>
                  </h3>
                  <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Period: {new Date(anchor.period * 1000).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {anchor.txHash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${anchor.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" /> Stellar Expert
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-sans font-medium text-[11px] mb-1">
                  Merkle Root (On-Chain State):
                </span>
                <span className="text-emerald-800 break-all font-semibold">
                  {anchor.merkleRoot}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-400 block font-sans font-medium text-[11px] mb-1">
                  Stellar Transaction Hash:
                </span>
                <span className="text-slate-700 break-all">
                  {anchor.txHash || 'Pending confirmation'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
