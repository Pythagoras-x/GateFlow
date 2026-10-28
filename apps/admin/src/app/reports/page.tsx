'use client';

import React, { useState, useEffect } from 'react';
import { AdminApiClient } from '@/lib/api';
import { AttendancePayrollReportResponseDto } from '@gateflow/shared-types';
import {
  BarChart3,
  Download,
  Users,
  Clock,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export default function ReportsPage() {
  const [report, setReport] = useState<AttendancePayrollReportResponseDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const data = await AdminApiClient.getPayrollReports();
      setReport(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!report) return;
    const headers = [
      'employeeNo',
      'employeeName',
      'department',
      'siteName',
      'daysPresent',
      'checkIns',
      'checkOuts',
      'hoursWorked',
      'lateArrivals',
      'anchoredEvents',
    ];
    const rows = report.items.map((i) => [
      `"${i.employeeNo}"`,
      `"${i.employeeName.replace(/"/g, '""')}"`,
      `"${i.department.replace(/"/g, '""')}"`,
      `"${i.siteName.replace(/"/g, '""')}"`,
      i.totalDaysPresent,
      i.totalCheckIns,
      i.totalCheckOuts,
      i.totalHoursWorked,
      i.lateArrivals,
      i.anchoredEventsCount,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-emerald-400" />
            Reports & Payroll Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Auditable attendance records, shift compliance, and exportable payroll data.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={!report || report.items.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export Payroll CSV
        </button>
      </div>

      {/* Summary Cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Users className="h-4 w-4 text-emerald-400" />
              Total Employees
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              {report.summary.totalEmployees}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Total Check-Ins
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              {report.summary.totalCheckIns}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <CheckCircle2 className="h-4 w-4 text-cyan-400" />
              Total Check-Outs
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              {report.summary.totalCheckOuts}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Clock className="h-4 w-4 text-amber-400" />
              Total Hours Worked
            </div>
            <div className="text-2xl font-bold text-white mt-2">
              {report.summary.totalHoursWorked} hrs
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <AlertCircle className="h-4 w-4 text-rose-400" />
              Late Arrivals
            </div>
            <div className="text-2xl font-bold text-rose-400 mt-2">
              {report.summary.totalLateArrivals}
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Employee Shift & Payroll Breakdown</h3>
          <span className="text-xs text-slate-400 font-mono">
            {report?.timeframe.startDate.slice(0, 10)} to {report?.timeframe.endDate.slice(0, 10)}
          </span>
        </div>

        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800/60 text-slate-400 font-medium text-xs border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-4">Site</th>
              <th className="py-3 px-4 text-center">Days Present</th>
              <th className="py-3 px-4 text-center">Check-Ins</th>
              <th className="py-3 px-4 text-center">Check-Outs</th>
              <th className="py-3 px-4 text-right">Hours Worked</th>
              <th className="py-3 px-4 text-center">Late</th>
              <th className="py-3 px-4 text-center">On-Chain Anchors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">
                  Calculating payroll metrics...
                </td>
              </tr>
            ) : !report || report.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">
                  No attendance data available for this timeframe.
                </td>
              </tr>
            ) : (
              report.items.map((item) => (
                <tr key={item.employeeId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-white">
                    {item.employeeName}
                    <span className="block text-xs font-mono text-slate-400">
                      {item.employeeNo}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{item.department}</td>
                  <td className="py-3 px-4 text-slate-300">{item.siteName}</td>
                  <td className="py-3 px-4 text-center font-mono">{item.totalDaysPresent}</td>
                  <td className="py-3 px-4 text-center font-mono text-emerald-400">
                    {item.totalCheckIns}
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-cyan-400">
                    {item.totalCheckOuts}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                    {item.totalHoursWorked.toFixed(1)}h
                  </td>
                  <td className="py-3 px-4 text-center">
                    {item.lateArrivals > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                        {item.lateArrivals}
                      </span>
                    ) : (
                      <span className="text-slate-600 font-mono">0</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      <ShieldCheck className="h-3 w-3" />
                      {item.anchoredEventsCount}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
