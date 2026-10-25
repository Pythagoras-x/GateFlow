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

export default function VerifierPage() {
  const [jsonInput, setJsonInput] = useState<string>('');
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    computedRoot: string;
    expectedRoot: string;
    leafVerified: boolean;
    message: string;
  } | null>(null);

  function handleLoadSample() {
    // Generate valid sample leaf matching sample bundle
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
    setVerificationResult(null);
  }

  function handleVerify() {
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

      setVerificationResult({
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <header className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="h-4 w-4" /> GateFlow Public Auditor Verifier
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">
          Independent Attendance Proof Verifier
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto text-sm leading-relaxed">
          Verify that an employee attendance record existed at a specific time and has not been altered,
          without exposing personal information.
        </p>
      </header>

      {/* Input Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-600" />
            Paste Proof Bundle (JSON)
          </label>
          <button
            onClick={handleLoadSample}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
          >
            Load Sample Proof Bundle
          </button>
        </div>

        <textarea
          rows={12}
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
            onClick={handleVerify}
            disabled={!jsonInput.trim()}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-sm transition disabled:opacity-50"
          >
            Verify Proof Bundle
          </button>
        </div>
      </div>

      {/* Verification Result Card */}
      {verificationResult && (
        <div
          className={`rounded-2xl p-6 border transition-all ${
            verificationResult.valid
              ? 'bg-emerald-50/70 border-emerald-300'
              : 'bg-red-50/70 border-red-300'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="mt-0.5">
              {verificationResult.valid ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              ) : (
                <XCircle className="h-7 w-7 text-red-600" />
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <h3
                  className={`text-lg font-bold ${
                    verificationResult.valid ? 'text-emerald-900' : 'text-red-900'
                  }`}
                >
                  {verificationResult.valid ? 'Proof Validated & Verified' : 'Verification Failed'}
                </h3>
                <p
                  className={`text-xs mt-1 ${
                    verificationResult.valid ? 'text-emerald-800' : 'text-red-800'
                  }`}
                >
                  {verificationResult.message}
                </p>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 text-xs font-mono space-y-2">
                <div>
                  <span className="text-slate-400 block font-sans font-medium text-[11px]">
                    Recomputed Merkle Root:
                  </span>
                  <span className="text-slate-900 break-all">{verificationResult.computedRoot}</span>
                </div>

                <div>
                  <span className="text-slate-400 block font-sans font-medium text-[11px]">
                    Expected Anchored Root:
                  </span>
                  <span className="text-slate-900 break-all">{verificationResult.expectedRoot}</span>
                </div>
              </div>

              {verificationResult.valid && (
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
  );
}
