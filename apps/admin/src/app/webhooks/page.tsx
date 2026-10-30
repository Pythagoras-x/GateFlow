'use client';

import React, { useState, useEffect } from 'react';
import {
  Webhook,
  WebhookEvent,
  WebhookDeliveryLog,
  CreateWebhookDto,
} from '@gateflow/shared-types';
import { AdminApiClient } from '@/lib/api';
import {
  Webhook as WebhookIcon,
  Plus,
  Radio,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  Send,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  X,
} from 'lucide-react';

const AVAILABLE_EVENTS = [
  { event: WebhookEvent.ATTENDANCE_CHECKED_IN, label: 'Employee Checked In', category: 'Workforce' },
  { event: WebhookEvent.ATTENDANCE_CHECKED_OUT, label: 'Employee Checked Out', category: 'Workforce' },
  { event: WebhookEvent.CORRECTION_APPROVED, label: 'Correction Approved', category: 'Workforce' },
  { event: WebhookEvent.VISITOR_ARRIVED, label: 'Visitor Arrived at Gate', category: 'Visitors & Access' },
  { event: WebhookEvent.VISITOR_DEPARTED, label: 'Visitor Departed', category: 'Visitors & Access' },
  { event: WebhookEvent.PASS_ISSUED, label: 'Pass Issued On-Chain', category: 'Visitors & Access' },
  { event: WebhookEvent.PASS_REVOKED, label: 'Pass Revoked On-Chain', category: 'Visitors & Access' },
  { event: WebhookEvent.ANCHOR_CONFIRMED, label: 'Merkle Anchor Confirmed', category: 'Blockchain' },
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWebhookForLogs, setSelectedWebhookForLogs] = useState<Webhook | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<WebhookDeliveryLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Create form state
  const [newUrl, setNewUrl] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([
    WebhookEvent.ATTENDANCE_CHECKED_IN,
    WebhookEvent.ATTENDANCE_CHECKED_OUT,
    WebhookEvent.ANCHOR_CONFIRMED,
  ]);
  const [creating, setCreating] = useState(false);

  // Test ping state
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    webhookId: string;
    success: boolean;
    status: number;
    durationMs: number;
    responseBody: string;
  } | null>(null);

  // Secret visibility
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadWebhooks();
  }, []);

  async function loadWebhooks() {
    setLoading(true);
    try {
      const data = await AdminApiClient.getWebhooks();
      setWebhooks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function generateSecret() {
    const chars = '0123456789abcdef';
    let res = 'gf_sec_';
    for (let i = 0; i < 32; i++) {
      res += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewSecret(res);
  }

  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl || selectedEvents.length === 0) return;
    setCreating(true);

    try {
      const created = await AdminApiClient.createWebhook({
        url: newUrl,
        secret: newSecret || undefined,
        events: selectedEvents,
      });
      setWebhooks((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewUrl('');
      setNewSecret('');
      setSelectedEvents([WebhookEvent.ATTENDANCE_CHECKED_IN, WebhookEvent.ANCHOR_CONFIRMED]);
    } catch (err: any) {
      alert(`Failed to create webhook: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteWebhook(id: string) {
    if (!confirm('Are you sure you want to delete this webhook subscription?')) return;
    try {
      await AdminApiClient.deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      if (selectedWebhookForLogs?.id === id) {
        setSelectedWebhookForLogs(null);
      }
    } catch (err: any) {
      alert(`Failed to delete webhook: ${err.message}`);
    }
  }

  async function handleToggleStatus(webhook: Webhook) {
    try {
      const updated = await AdminApiClient.updateWebhook(webhook.id, {
        isActive: !webhook.isActive,
      });
      setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? updated : w)));
    } catch (err: any) {
      alert(`Failed to update webhook: ${err.message}`);
    }
  }

  async function handleTestPing(webhook: Webhook) {
    setTestingWebhookId(webhook.id);
    setTestResult(null);

    try {
      const res = await AdminApiClient.testWebhook(webhook.id);
      setTestResult({
        webhookId: webhook.id,
        success: res.success,
        status: res.responseStatus,
        durationMs: res.durationMs,
        responseBody: res.responseBody,
      });
    } catch (err: any) {
      setTestResult({
        webhookId: webhook.id,
        success: false,
        status: 500,
        durationMs: 0,
        responseBody: err.message,
      });
    } finally {
      setTestingWebhookId(null);
    }
  }

  async function openLogsDrawer(webhook: Webhook) {
    setSelectedWebhookForLogs(webhook);
    setLogsLoading(true);
    try {
      const logs = await AdminApiClient.getWebhookDeliveries(webhook.id);
      setDeliveryLogs(logs);
    } catch (err) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const totalEventsSubscribed = webhooks.reduce((acc, w) => acc + (w.events?.length || 0), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <WebhookIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Outbound Webhooks</h1>
              <p className="text-sm text-slate-400">
                Cryptographically signed HMAC-SHA256 webhook dispatching for HRIS, payroll, and physical gate controllers
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            generateSecret();
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/10"
        >
          <Plus className="h-4 w-4" />
          Register Endpoint
        </button>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Configured Endpoints</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{webhooks.length}</div>
          <p className="text-xs text-slate-500 mt-1">
            {webhooks.filter((w) => w.isActive).length} active, {webhooks.filter((w) => !w.isActive).length} paused
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Subscribed Events</span>
            <Radio className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalEventsSubscribed}</div>
          <p className="text-xs text-slate-500 mt-1">Across 8 event classifications</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Signature Standard</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">HMAC-SHA256</div>
          <p className="text-xs text-slate-500 mt-1">Header: <code className="text-emerald-400">X-GateFlow-Signature</code></p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium">Retry Policy</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">Exponential</div>
          <p className="text-xs text-slate-500 mt-1">Up to 3 retries (1m, 5m, 15m backoff)</p>
        </div>
      </div>

      {/* Webhook Endpoints List */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Registered Webhook Subscriptions</h2>
          <button
            onClick={loadWebhooks}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {webhooks.length === 0 && !loading ? (
          <div className="p-12 text-center">
            <WebhookIcon className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No webhook endpoints registered yet.</p>
            <p className="text-slate-500 text-xs mt-1">
              Add your first endpoint to stream attendance and visitor pass events.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {webhooks.map((webhook) => {
              const isRevealed = revealedSecrets[webhook.id];
              const isTesting = testingWebhookId === webhook.id;
              const hasTestResult = testResult?.webhookId === webhook.id;

              return (
                <div key={webhook.id} className="p-6 hover:bg-slate-800/30 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-3 flex-1 min-w-0">
                      {/* URL and Status */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            webhook.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              webhook.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                            }`}
                          />
                          {webhook.isActive ? 'Active' : 'Paused'}
                        </span>

                        <span className="font-mono text-sm font-semibold text-white break-all">
                          {webhook.url}
                        </span>

                        <button
                          onClick={() => copyToClipboard(webhook.url, `url-${webhook.id}`)}
                          className="text-slate-500 hover:text-slate-300 transition-colors"
                          title="Copy URL"
                        >
                          {copiedId === `url-${webhook.id}` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Secret */}
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Key className="h-3.5 w-3.5 text-slate-500" />
                        <span className="font-mono text-slate-300">
                          {isRevealed ? webhook.secret : 'gf_sec_••••••••••••••••••••••••••••••••'}
                        </span>
                        <button
                          onClick={() =>
                            setRevealedSecrets((prev) => ({ ...prev, [webhook.id]: !prev[webhook.id] }))
                          }
                          className="text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(webhook.secret, `sec-${webhook.id}`)}
                          className="text-slate-500 hover:text-slate-300 transition-colors"
                          title="Copy Secret"
                        >
                          {copiedId === `sec-${webhook.id}` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Subscribed Events */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {webhook.events.map((evt) => (
                          <span
                            key={evt}
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700/60"
                          >
                            {evt}
                          </span>
                        ))}
                      </div>

                      {/* Inline Test Ping Result */}
                      {hasTestResult && (
                        <div
                          className={`mt-2 p-3 rounded-lg border text-xs font-mono flex items-center justify-between ${
                            testResult.success
                              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                              : 'bg-red-950/30 border-red-800/60 text-red-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {testResult.success ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-400" />
                            )}
                            <span>
                              Test Response: HTTP {testResult.status} ({testResult.durationMs}ms)
                            </span>
                          </div>
                          <button
                            onClick={() => setTestResult(null)}
                            className="text-slate-400 hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-start">
                      <button
                        onClick={() => handleTestPing(webhook)}
                        disabled={isTesting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors border border-slate-700"
                        title="Send test ping"
                      >
                        <Send className={`h-3.5 w-3.5 ${isTesting ? 'animate-pulse text-emerald-400' : ''}`} />
                        {isTesting ? 'Pinging...' : 'Test Ping'}
                      </button>

                      <button
                        onClick={() => openLogsDrawer(webhook)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors border border-slate-700"
                        title="View delivery logs"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Deliveries
                      </button>

                      <button
                        onClick={() => handleToggleStatus(webhook)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors border border-slate-700"
                      >
                        {webhook.isActive ? 'Pause' : 'Resume'}
                      </button>

                      <button
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete subscription"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Register Webhook Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <WebhookIcon className="h-5 w-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Register Webhook Endpoint</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Payload URL (HTTPS required in production)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://api.yourcompany.com/webhooks/gateflow"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Secret Key (used to generate HMAC-SHA256 signature)
                  </label>
                  <button
                    type="button"
                    onClick={generateSecret}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    Generate New
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Select Subscribed Event Triggers
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {AVAILABLE_EVENTS.map((item) => {
                    const isChecked = selectedEvents.includes(item.event);
                    return (
                      <label
                        key={item.event}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                            : 'bg-slate-800/40 border-slate-750 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-slate-200">{item.label}</div>
                          <div className="font-mono text-[11px] text-slate-400">{item.event}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEvents((prev) => [...prev, item.event]);
                            } else {
                              setSelectedEvents((prev) => prev.filter((ev) => ev !== item.event));
                            }
                          }}
                          className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newUrl || selectedEvents.length === 0}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-900 font-semibold text-sm transition-colors"
                >
                  {creating ? 'Saving...' : 'Register Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deliveries Drawer / Modal */}
      {selectedWebhookForLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Webhook Delivery Logs</h3>
                <p className="text-xs text-slate-400 font-mono truncate max-w-md">
                  {selectedWebhookForLogs.url}
                </p>
              </div>
              <button
                onClick={() => setSelectedWebhookForLogs(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {logsLoading ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-emerald-400" />
                  Loading delivery history...
                </div>
              ) : deliveryLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No delivery logs recorded for this endpoint yet.
                </div>
              ) : (
                deliveryLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-lg border border-slate-800 bg-slate-800/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.success
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          HTTP {log.responseStatus || (log.success ? 200 : 500)}
                        </span>
                        <span className="font-mono font-semibold text-slate-200">{log.event}</span>
                      </div>
                      <span className="text-slate-500 text-[11px]">
                        {new Date(log.deliveredAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-400">Request Payload:</div>
                      <pre className="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-24">
                        {log.payload}
                      </pre>
                    </div>

                    {log.responseBody && (
                      <div className="space-y-1">
                        <div className="text-[11px] text-slate-400">Response Body:</div>
                        <pre className="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-16">
                          {log.responseBody}
                        </pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedWebhookForLogs(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
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
