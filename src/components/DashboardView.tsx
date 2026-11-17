import React, { useEffect, useState } from 'react';
import { Filter, RotateCcw, TrendingUp } from 'lucide-react';
import { apiFetch } from '../services/api';
import { formatInrCompact, formatInrFull, titleize } from '../utils/format';
import type { DashboardMetrics, ProjectRecord, UserRecord } from '../types';

interface DashboardViewProps {
  currentUser: UserRecord;
  projects: ProjectRecord[];
  employees: UserRecord[];
}

export function DashboardView({ currentUser, projects, employees }: DashboardViewProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [location, setLocation] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cities = Array.from(new Set(projects.map((p) => p.city))).concat(
    ['Mumbai'].filter((c) => !projects.some((p) => p.city === c))
  );

  const salesTeam = employees.filter(
    (u) => u.roleCode === 'sales_exec' || u.roleCode === 'sales_manager'
  );

  async function loadMetrics() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (projectId) params.set('projectId', projectId);
      if (employeeId) params.set('employeeId', employeeId);
      if (location) params.set('location', location);
      const data = await apiFetch<DashboardMetrics>(`/api/dashboard?${params.toString()}`);
      setMetrics(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard analytics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, projectId, employeeId, location]);

  function resetFilters() {
    setStartDate('');
    setEndDate('');
    setProjectId('');
    setEmployeeId('');
    setLocation('');
  }

  const maxMonthlyRevenue = metrics
    ? Math.max(...metrics.monthlySalesGraph.map((m) => m.revenueInr), 10000000)
    : 10000000;

  return (
    <div className="space-y-6">
      {/* Filter Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
            <Filter className="w-4 h-4 text-emerald-600" />
            <span>Executive Filters</span>
            {currentUser.roleCode === 'sales_exec' && (
              <span className="text-xs font-normal text-slate-500">
                · Scoped to {currentUser.fullName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-[#0B1F3A] border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="flt-start" className="block text-[11px] font-medium text-slate-500 mb-1">
              From Date (IST)
            </label>
            <input
              id="flt-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <label htmlFor="flt-end" className="block text-[11px] font-medium text-slate-500 mb-1">
              To Date (IST)
            </label>
            <input
              id="flt-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <label htmlFor="flt-project" className="block text-[11px] font-medium text-slate-500 mb-1">
              Development Project
            </label>
            <select
              id="flt-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.city})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="flt-employee" className="block text-[11px] font-medium text-slate-500 mb-1">
              Sales Employee
            </label>
            <select
              id="flt-employee"
              value={currentUser.roleCode === 'sales_exec' ? currentUser.id : employeeId}
              disabled={currentUser.roleCode === 'sales_exec'}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">All Sales Employees</option>
              {salesTeam.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.city})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="flt-location" className="block text-[11px] font-medium text-slate-500 mb-1">
              Location / City
            </label>
            <select
              id="flt-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !metrics ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : metrics ? (
        <>
          {/* Primary Financial & Conversion Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0B1F3A] text-white rounded-xl p-5">
              <p className="text-xs text-slate-300 font-medium">Total Revenue (Bookings)</p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-white">
                {formatInrCompact(metrics.kpis.totalRevenueInr)}
              </p>
              <p className="mt-1.5 text-xs text-emerald-300 font-mono tabular-nums">
                Collected: {formatInrCompact(metrics.kpis.collectedRevenueInr)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500 font-medium">Pending Payments (INR)</p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-700">
                {formatInrCompact(metrics.kpis.pendingPaymentsInr)}
              </p>
              <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
                {formatInrFull(metrics.kpis.pendingPaymentsInr)} due
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500 font-medium">Bookings Confirmed</p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-700">
                {metrics.kpis.bookingsConfirmed}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                Active confirmed &amp; registered units
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500 font-medium">Lead-to-Booking Conversion</p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums text-[#0B1F3A]">
                {metrics.kpis.conversionRatePct}%
              </p>
              <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                {metrics.kpis.bookingsConfirmed} of {metrics.kpis.totalEnquiries} enquiries
              </p>
            </div>
          </section>

          {/* 13 Lead & Activity KPI Grid */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#0B1F3A] mb-4">
              Enquiries, Lead Temperature &amp; Site Visit Operations
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 divide-y sm:divide-y-0">
              {[
                { label: 'Total Enquiries', value: metrics.kpis.totalEnquiries, tone: 'text-[#0B1F3A]' },
                { label: "Today's Enquiries", value: metrics.kpis.todaysEnquiries, tone: 'text-emerald-700' },
                { label: 'New Leads', value: metrics.kpis.newLeads, tone: 'text-[#0B1F3A]' },
                { label: 'Hot Leads', value: metrics.kpis.hotLeads, tone: 'text-red-700' },
                { label: 'Warm Leads', value: metrics.kpis.warmLeads, tone: 'text-amber-700' },
                { label: 'Cold Leads', value: metrics.kpis.coldLeads, tone: 'text-slate-600' },
                { label: 'Follow-ups Pending', value: metrics.kpis.followUpsPending, tone: 'text-amber-700' },
                { label: 'Site Visits Scheduled', value: metrics.kpis.siteVisitsScheduled, tone: 'text-[#0B1F3A]' },
                { label: 'Site Visits Completed', value: metrics.kpis.siteVisitsCompleted, tone: 'text-emerald-700' },
                { label: 'Conversion Rate', value: `${metrics.kpis.conversionRatePct}%`, tone: 'text-emerald-700' },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-lg bg-slate-50/80 border border-slate-100">
                  <div className="text-xs text-slate-500">{item.label}</div>
                  <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${item.tone}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Monthly Sales Graph + Lead Source Analytics */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#0B1F3A]">Monthly Sales Graph (INR)</h3>
                  <p className="text-xs text-slate-500">6-month revenue trajectory &amp; booking volume</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <TrendingUp className="w-4 h-4" />
                  <span>INR Crores</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="grid grid-cols-6 gap-3 items-end h-52 pt-6 pb-2 border-b border-slate-200">
                  {metrics.monthlySalesGraph.map((point) => {
                    const heightPct = Math.max(8, Math.round((point.revenueInr / maxMonthlyRevenue) * 100));
                    return (
                      <div key={point.month} className="flex flex-col items-center justify-end h-full">
                        <span className="text-[11px] font-mono tabular-nums text-slate-600 mb-1.5">
                          {formatInrCompact(point.revenueInr).replace('₹', '₹')}
                        </span>
                        <div className="w-full max-w-[44px] bg-slate-100 rounded-t-md flex items-end h-36 overflow-hidden">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full bg-gradient-to-t from-[#0B1F3A] to-emerald-600 rounded-t-md transition-all duration-300"
                            title={`${point.month}: ${formatInrFull(point.revenueInr)} (${point.bookings} bookings)`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-6 gap-3 pt-2 text-center">
                  {metrics.monthlySalesGraph.map((point) => (
                    <div key={point.month}>
                      <div className="text-xs font-semibold text-[#0B1F3A]">{point.month}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {point.bookings} bkg · {point.enquiries} enq
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Lead Source Analytics */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#0B1F3A]">Lead Source Analytics</h3>
              <p className="text-xs text-slate-500 mb-4">Enquiry share and booking conversion by channel</p>

              <div className="space-y-3">
                {metrics.leadSourceAnalytics.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">No leads match current filters.</p>
                ) : (
                  metrics.leadSourceAnalytics.map((src) => {
                    const widthPct = metrics.kpis.totalEnquiries
                      ? Math.max(6, Math.round((src.count / metrics.kpis.totalEnquiries) * 100))
                      : 0;
                    return (
                      <div key={src.source} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-800">{titleize(src.source)}</span>
                          <span className="font-mono tabular-nums text-slate-600">
                            {src.count} leads · {src.bookings} booked · {src.conversionPct}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className="h-full bg-emerald-600 rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Project-Wise Sales + Employee Performance */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
              <h3 className="text-sm font-semibold text-[#0B1F3A]">Project-Wise Sales</h3>
              <p className="text-xs text-slate-500 mb-4">Confirmed bookings and remaining unit inventory</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2 pr-3">Project</th>
                    <th className="py-2 px-2 text-right">Booked</th>
                    <th className="py-2 px-2 text-right">Avail</th>
                    <th className="py-2 pl-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {metrics.projectWiseSales.map((p) => (
                    <tr key={p.projectId} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[#0B1F3A]">{p.projectName}</div>
                        <div className="text-[11px] text-slate-500">{p.city}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums font-medium">
                        {p.bookingsCount}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                        {p.availableUnits}/{p.totalUnits}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatInrCompact(p.revenueInr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
              <h3 className="text-sm font-semibold text-[#0B1F3A]">Employee Performance</h3>
              <p className="text-xs text-slate-500 mb-4">Sales pipeline throughput, visits &amp; monthly INR target attainment</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2 pr-3">Employee</th>
                    <th className="py-2 px-2 text-right">Leads</th>
                    <th className="py-2 px-2 text-right">Visits</th>
                    <th className="py-2 px-2 text-right">Closed</th>
                    <th className="py-2 px-2 text-right">Revenue</th>
                    <th className="py-2 pl-2 text-right">Target %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {metrics.employeePerformance.map((emp) => (
                    <tr key={emp.employeeId} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[#0B1F3A]">{emp.name}</div>
                        <div className="text-[11px] text-slate-500">{emp.city}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">{emp.leadsAssigned}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">{emp.siteVisitsDone}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold">
                        {emp.bookingsClosed}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatInrCompact(emp.revenueInr)}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono tabular-nums">
                        {emp.attainmentPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
