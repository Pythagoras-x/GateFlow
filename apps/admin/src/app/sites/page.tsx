'use client';

import React, { useEffect, useState } from 'react';
import { Building2, Plus, ShieldCheck, MapPin, Globe } from 'lucide-react';
import { AdminApiClient } from '../../lib/api';
import { SiteResponseDto } from '@gateflow/shared-types';

export default function SitesPage() {
  const [sites, setSites] = useState<SiteResponseDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [submitting, setSubmitting] = useState<boolean>(false);

  async function loadSites() {
    try {
      const data = await AdminApiClient.getSites();
      setSites(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSites();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    try {
      await AdminApiClient.createSite(name, timezone);
      setName('');
      setShowModal(false);
      await loadSites();
    } catch (err: any) {
      alert(err.message || 'Failed to create site');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sites & Facilities</h2>
          <p className="text-sm text-slate-500">
            Physical sites and campuses registered on-chain for attendance and pass validation
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm inline-flex items-center gap-2 transition"
        >
          <Plus className="h-4 w-4" /> Register Site
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.map(({ site, onchainRegistered }) => (
          <div
            key={site.id}
            className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{site.name}</h3>
                  <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3" /> {site.timezone}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" /> On-Chain
              </span>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs">
              <span className="text-slate-400 block font-medium">On-chain Site ID (32-byte hash):</span>
              <span className="font-mono text-slate-700 break-all">{site.siteIdHash}</span>
            </div>

            {site.geofence && (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400" /> Geofence radius: {site.geofence.radiusMeters}m
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Register New Site</h3>
            <p className="text-xs text-slate-500">
              Registers the physical location in the database and records its hash on the Soroban core contract.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Site Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. San Francisco Campus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {submitting ? 'Registering on-chain...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
