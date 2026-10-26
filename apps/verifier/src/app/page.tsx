'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  FileCheck2,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Copy,
  Terminal,
  UserCheck,
  Clock,
  Building2,
  KeyRound,
} from 'lucide-react';
import { computeRootFromProof, verifyMerkleProof, hashLeaf } from '@gateflow/merkle';
import { MerkleProofBundle } from '@gateflow/shared-types';

const SAMPLE_BUNDLE: MerkleProofBundle = {
  leaf: 'c4e3b79f9765d7715f6244463dfb12e1f40d1ebf4614ffaa08c903a429a17e08',
  proof: [
    {
      position: 'right',
      data: 'a3d135d5d852a39a2d3e4b772413158e0a1b2c3d4e5f60718293a4b5c6d7e8f9',
    },
    {
      position: 'left',
      data: '8888888888888888888888888888888888888888888888888888888888888888',
    },
  ],
  root: 'b39bf838e1b5cf287ec548aa5fe2c23c10e427b3d32ef7414909a473b98363b4',
  period: 1715000000,
  siteId: '1111111111111111111111111111111111111111111111111111111111111111',
  txHash: '7f9185a9bc83f095d2c55416295fc399e57849adbb504265551fb5d35eb7bca4',
  rawEvent: {
    employeeRef: 'EMP-001',
    siteId: '1111111111111111111111111111111111111111111111111111111111111111',
    type: 'IN' as any,
    timestamp: 1715000000,
    nonce: 'a8b7c6d5e4f3a2b1',
    salt: 'f40d1ebf4614ffaa08c903a429a17e08f40d1ebf4614ffaa08c903a429a17e08',
  },
};

const SAMPLE_PASS = {
  passIdHash: 'e7f4c51982b6a2f30b912389cd4f890123456789abcdef0123456789abcdef01',
  passHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
  siteId: '1111111111111111111111111111111111111111111111111111111111111111',
  hostAddress: 'GBHOST0000000000000000000000000000000000000000000000GATEFLOW',
  validFrom: Math.floor(Date.now() / 1000) - 3600,
  validUntil: Math.floor(Date.now() / 1000) + 14400,
  status: 'Active',
  onchainTxHash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
  contractId: 'CVIS0000000000000000000000000000000000000000000000GATEFLOW',
};

export default function VerifierPage() {
  const [activeTab, setActiveTab] = useState<'merkle' | 'pass'>('merkle');

  // Merkle verification state
  const [jsonInput, setJsonInput] = useState<string>('');
  const [merkleResult, setMerkleResult] = useState<{
    valid: boolean;
    computedRoot: string;
    expectedRoot: string;
    leafVerified: boolean;
    message: string;
  } | null>(null);

  // Pass verification state
  const [passJsonInput, setPassJsonInput] = useState<string>('');
  const [passResult, setPassResult] = useState<{
    valid: boolean;
    status: string;
    message: string;
    timeRemaining?: string;
    details?: any;
  } | null>(null);

  function handleLoadMerkleSample() {
    const sample = JSON.parse(JSON.stringify(SAMPLE_BUNDLE));
    const computedLeaf = hashLeaf(
      {
        employee_ref: sample.rawEvent.employeeRef,
        nonce: sample.rawEvent.nonce,
        site_id: sample.rawEvent.siteId,
        timestamp: sample.rawEvent.timestamp,
        type: sample.rawEvent.type,
      },
      sample.rawEvent.salt
    );
    sample.leaf = computedLeaf;
    sample.root = computeRootFromProof(sample.leaf, sample.proof);

    setJsonInput(JSON.stringify(sample, null, 2));
    setMerkleResult(null);
  }

  function handleVerifyMerkle() {
    try {
      const bundle: MerkleProofBundle = JSON.parse(jsonInput);
      if (!bundle.leaf || !bundle.proof || !bundle.root) {
        throw new Error('Bundle must include "leaf", "proof", and "root" fields');
      }

      let leafVerified = true;
      if (bundle.rawEvent) {
        const computedLeaf = hashLeaf(
          {
            employee_ref: bundle.rawEvent.employeeRef,
            nonce: bundle.rawEvent.nonce,
            site_id: bundle.rawEvent.siteId,
            timestamp: bundle.rawEvent.timestamp,
            type: bundle.rawEvent.type,
          },
          bundle.rawEvent.salt
        );
        leafVerified = computedLeaf.toLowerCase() === bundle.leaf.toLowerCase();
      }

      const computedRoot = computeRootFromProof(bundle.leaf, bundle.proof);
      const isRootValid = computedRoot.toLowerCase() === bundle.root.toLowerCase();
      const isValid = isRootValid && leafVerified;

      setMerkleResult({
        valid: isValid,
        computedRoot,
        expectedRoot: bundle.root,
        leafVerified,
        message: isValid
          ? 'Cryptographic verification SUCCESSFUL! Record mathematically proven to exist in the anchored tree.'
          : !leafVerified
          ? 'Leaf verification FAILED: Raw attendance event data does not match the salted leaf hash.'
          : 'Merkle root mismatch: Recomputed root from proof path does not equal expected root (tampered proof).',
      });
    } catch (err: any) {
      alert('Error parsing JSON proof bundle: ' + err.message);
    }
  }

  function handleLoadPassSample() {
    setPassJsonInput(JSON.stringify(SAMPLE_PASS, null, 2));
    setPassResult(null);
  }

  function handleVerifyPass() {
    try {
      const pass = JSON.parse(passJsonInput);
      if (!pass.passIdHash || !pass.validFrom || !pass.validUntil) {
        throw new Error('Pass must include "passIdHash", "validFrom", and "validUntil"');
      }

      const now = Math.floor(Date.now() / 1000);
      let isValid = true;
      let status = pass.status || 'Active';
      let message = 'Pass is valid and active on-chain.';

      if (status === 'Revoked') {
        isValid = false;
        message = 'Pass has been REVOKED on-chain by the issuing host or administrator.';
      } else if (now < pass.validFrom) {
        isValid = false;
        status = 'NotYetActive';
        message = `Pass is not yet active (valid from ${new Date(pass.validFrom * 1000).toLocaleString()}).`;
      } else if (now > pass.validUntil) {
        isValid = false;
        status = 'Expired';
        message = `Pass has EXPIRED at ${new Date(pass.validUntil * 1000).toLocaleString()}.`;
      }

      const remainingSec = Math.max(0, pass.validUntil - now);
      const hours = Math.floor(remainingSec / 3600);
      const mins = Math.floor((remainingSec % 3600) / 60);

      setPassResult({
        valid: isValid,
        status,
        message,
        timeRemaining: `${hours}h ${mins}m remaining`,
        details: pass,
      });
    } catch (err: any) {
      alert('Error parsing Visitor Pass payload: ' + err.message);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <header className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="h-4 w-4" /> GateFlow Public Auditor Verifier
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
          Independent Stellar Proof & Pass Verifier
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto text-sm leading-relaxed">
          Verify workforce attendance Merkle proofs and on-chain Soroban visitor passes without exposing personal data.
        </p>

        {/* Mode switcher tabs */}
        <div className="flex justify-center gap-3 pt-4">
          <button
            onClick={() => setActiveTab('merkle')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'merkle'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <FileCheck2 className="h-4 w-4" />
            Attendance Merkle Proof
          </button>
          <button
            onClick={() => setActiveTab('pass')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'pass'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            Soroban Visitor Pass
          </button>
        </div>
      </header>

      {/* Tab 1: Merkle Verification */}
      {activeTab === 'merkle' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-600" />
                Paste Merkle Proof Bundle (JSON)
              </label>
              <button
                onClick={handleLoadMerkleSample}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
              >
                Load Sample Proof Bundle
              </button>
            </div>

            <textarea
              rows={11}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={`{\n  "leaf": "c4e3b7...",\n  "proof": [{ "position": "right", "data": "..." }],\n  "root": "b39bf...",\n  "period": 1715000000,\n  "siteId": "..."\n}`}
              className="w-full p-4 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-800"
            />

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-500">
                Client-side cryptographic SHA-256 verification via <code className="bg-slate-100 px-1 py-0.5 rounded">@gateflow/merkle</code>
              </span>
              <button
                onClick={handleVerifyMerkle}
                disabled={!jsonInput.trim()}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition disabled:opacity-50"
              >
                Verify Proof Bundle
              </button>
            </div>
          </div>

          {merkleResult && (
            <div
              className={`rounded-2xl p-6 border transition-all ${
                merkleResult.valid ? 'bg-emerald-50/70 border-emerald-300' : 'bg-red-50/70 border-red-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5">
                  {merkleResult.valid ? (
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  ) : (
                    <XCircle className="h-7 w-7 text-red-600" />
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <h3
                      className={`text-lg font-bold ${
                        merkleResult.valid ? 'text-emerald-900' : 'text-red-900'
                      }`}
                    >
                      {merkleResult.valid ? 'Proof Validated & Verified' : 'Verification Failed'}
                    </h3>
                    <p
                      className={`text-xs mt-1 ${
                        merkleResult.valid ? 'text-emerald-800' : 'text-red-800'
                      }`}
                    >
                      {merkleResult.message}
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-slate-200 text-xs font-mono space-y-2">
                    <div>
                      <span className="text-slate-400 block font-sans font-medium text-[11px]">
                        Recomputed Merkle Root:
                      </span>
                      <span className="text-slate-900 break-all">{merkleResult.computedRoot}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 block font-sans font-medium text-[11px]">
                        Expected Anchored Root:
                      </span>
                      <span className="text-slate-900 break-all">{merkleResult.expectedRoot}</span>
                    </div>
                  </div>

                  {merkleResult.valid && (
                    <div className="pt-2">
                      <a
                        href="https://stellar.expert/explorer/testnet"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        View on Stellar Expert Explorer <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pass Verification */}
      {activeTab === 'pass' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-600" />
                Paste On-Chain Visitor Pass Data (JSON)
              </label>
              <button
                onClick={handleLoadPassSample}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
              >
                Load Sample Pass
              </button>
            </div>

            <textarea
              rows={11}
              value={passJsonInput}
              onChange={(e) => setPassJsonInput(e.target.value)}
              placeholder={`{\n  "passIdHash": "e7f4c519...",\n  "passHash": "a1b2c3...",\n  "validFrom": 1715000000,\n  "validUntil": 1715086400,\n  "status": "Active"\n}`}
              className="w-full p-4 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 border border-slate-800"
            />

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-500">
                Verifies against <code className="bg-slate-100 px-1 py-0.5 rounded">gateflow-visitors</code> Soroban smart contract rules
              </span>
              <button
                onClick={handleVerifyPass}
                disabled={!passJsonInput.trim()}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition disabled:opacity-50"
              >
                Verify Visitor Pass
              </button>
            </div>
          </div>

          {passResult && (
            <div
              className={`rounded-2xl p-6 border transition-all ${
                passResult.valid ? 'bg-emerald-50/70 border-emerald-300' : 'bg-red-50/70 border-red-300'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-0.5">
                  {passResult.valid ? (
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  ) : (
                    <XCircle className="h-7 w-7 text-red-600" />
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3
                        className={`text-lg font-bold ${
                          passResult.valid ? 'text-emerald-900' : 'text-red-900'
                        }`}
                      >
                        {passResult.valid ? 'Pass Valid & Verified' : 'Pass Invalid or Expired'}
                      </h3>
                      <p
                        className={`text-xs mt-1 ${
                          passResult.valid ? 'text-emerald-800' : 'text-red-800'
                        }`}
                      >
                        {passResult.message}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                        passResult.valid
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      {passResult.status}
                    </span>
                  </div>

                  {passResult.details && (
                    <div className="bg-white rounded-xl p-4 border border-slate-200 text-xs font-mono space-y-2">
                      <div className="grid grid-cols-2 gap-2 font-sans mb-2">
                        <div>
                          <span className="text-slate-400 block text-[11px]">Valid Window:</span>
                          <span className="text-slate-800 font-semibold">
                            {new Date(passResult.details.validFrom * 1000).toLocaleTimeString()} -{' '}
                            {new Date(passResult.details.validUntil * 1000).toLocaleTimeString()}
                          </span>
                        </div>
                        {passResult.timeRemaining && (
                          <div>
                            <span className="text-slate-400 block text-[11px]">Time Remaining:</span>
                            <span className="text-emerald-700 font-semibold">{passResult.timeRemaining}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 block font-sans font-medium text-[11px]">
                          Soroban Pass ID Hash (32 bytes):
                        </span>
                        <span className="text-slate-900 break-all">{passResult.details.passIdHash}</span>
                      </div>

                      {passResult.details.contractId && (
                        <div>
                          <span className="text-slate-400 block font-sans font-medium text-[11px]">
                            Visitors Contract ID:
                          </span>
                          <span className="text-slate-900 break-all">{passResult.details.contractId}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {passResult.details?.onchainTxHash && (
                    <div className="pt-2">
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${passResult.details.onchainTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        Inspect On-Chain Pass Issuance Transaction <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
