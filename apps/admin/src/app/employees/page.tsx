'use client';

import React, { useEffect, useState } from 'react';
import { Users, Plus, QrCode, Lock, Shield } from 'lucide-react';
import { AdminApiClient } from '../../lib/api';
import { Employee } from '@gateflow/shared-types';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showEnrolModal, setShowEnrolModal] = useState<boolean>(false);
  const [selectedEmpQr, setSelectedEmpQr] = useState<{ name: string; token: string; ttl: number } | null>(null);

  // Form fields
  const [employeeNo, setEmployeeNo] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Engineering');
  const [submitting, setSubmitting] = useState(false);

  async function loadEmployees() {
    try {
      const data = await AdminApiClient.getEmployees();
      setEmployees(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  async function handleEnrol(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeNo || !name) return;
    setSubmitting(true);
    try {
      await AdminApiClient.createEmployee({ employeeNo, name, department });
      setEmployeeNo('');
      setName('');
      setShowEnrolModal(false);
      await loadEmployees();
    } catch (err: any) {
      alert(err.message || 'Failed to enrol employee');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShowQr(emp: Employee) {
    const res = await AdminApiClient.getQrToken(emp.id, 'site-ny-hq');
    setSelectedEmpQr({
      name: emp.name,
      token: res.token,
      ttl: res.ttlSeconds,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Employee Directory</h2>
          <p className="text-sm text-slate-500">
            Workforce roster with AES-256-GCM encrypted personally identifiable data
          </p>
        </div>
        <button
          onClick={() => setShowEnrolModal(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm inline-flex items-center gap-2 transition"
        >
          <Plus className="h-4 w-4" /> Enrol Employee
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 font-medium">Employee No</th>
              <th className="px-6 py-3 font-medium">Full Name (Decrypted)</th>
              <th className="px-6 py-3 font-medium">Department</th>
              <th className="px-6 py-3 font-medium">Privacy Status</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-slate-50/60 transition">
                <td className="px-6 py-4 font-mono font-medium text-slate-900">{emp.employeeNo}</td>
                <td className="px-6 py-4 font-medium text-slate-900">{emp.name}</td>
                <td className="px-6 py-4 text-slate-600">{emp.department}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Lock className="h-3 w-3" /> PII Encrypted
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleShowQr(emp)}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition"
                  >
                    <QrCode className="h-3.5 w-3.5" /> Rotating QR
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Enrol Modal */}
      {showEnrolModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Enrol New Employee</h3>
            <p className="text-xs text-slate-500">
              Personal information is encrypted using application-layer AES-256-GCM.
            </p>
            <form onSubmit={handleEnrol} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Employee Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP-1042"
                  value={employeeNo}
                  onChange={(e) => setEmployeeNo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Elena Rostova"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Operations">Operations</option>
                  <option value="Security">Security</option>
                  <option value="Human Resources">Human Resources</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEnrolModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {submitting ? 'Enrolling...' : 'Enrol'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {selectedEmpQr && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl text-center space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Rotating Gate Pass</h3>
            <p className="text-xs text-slate-500">
              Single-use HMAC signed QR code for {selectedEmpQr.name}. Valid for {selectedEmpQr.ttl}s.
            </p>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center">
              <div className="h-44 w-44 bg-white border border-slate-300 rounded-lg flex items-center justify-center shadow-inner">
                <QrCode className="h-32 w-32 text-slate-800" />
              </div>
              <span className="font-mono text-[10px] text-slate-500 mt-3 break-all px-2">
                {selectedEmpQr.token.slice(0, 48)}...
              </span>
            </div>
            <button
              onClick={() => setSelectedEmpQr(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
