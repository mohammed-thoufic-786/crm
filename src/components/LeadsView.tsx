import React, { useState } from 'react';
import { Plus, Search, UserPlus, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { formatInrCompact, formatIstDateTime, LANGUAGE_LABELS, titleize } from '../utils/format';
import type { LeadRecord, LeadTemperature, LeadStage, ProjectRecord, UserRecord } from '../types';

interface LeadsViewProps {
  currentUser: UserRecord;
  leads: LeadRecord[];
  projects: ProjectRecord[];
  employees: UserRecord[];
  onRefresh: () => Promise<void>;
  onOpenBookingForLead: (lead: LeadRecord) => void;
}

const STAGES: LeadStage[] = [
  'new',
  'contacted',
  'qualified',
  'site_visit_scheduled',
  'site_visit_done',
  'negotiation',
  'booked',
  'lost',
];

export function LeadsView({
  currentUser,
  leads,
  projects,
  employees,
  onRefresh,
  onOpenBookingForLead,
}: LeadsViewProps) {
  const [search, setSearch] = useState('');
  const [tempFilter, setTempFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list');
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    phone: '+91 ',
    email: '',
    preferredLanguage: 'en',
    source: 'whatsapp',
    temperature: 'hot',
    interestedCategory: 'apartment',
    transactionIntent: 'primary_sale',
    preferredCity: 'Bengaluru',
    preferredLocality: '',
    budgetMinInr: '12000000',
    budgetMaxInr: '22000000',
    projectId: projects[0]?.id || '',
    assignedTo: currentUser.id,
    aiSummary: '',
  });

  const canAssign = currentUser.roleCode === 'admin' || currentUser.roleCode === 'sales_manager';
  const salesTeam = employees.filter(
    (u) => u.roleCode === 'sales_exec' || u.roleCode === 'sales_manager'
  );

  const filtered = leads.filter((l) => {
    if (tempFilter !== 'all' && l.temperature !== tempFilter) return false;
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.fullName.toLowerCase().includes(q) ||
        l.leadCode.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.preferredCity.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleCreateLead(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          budgetMinInr: Number(form.budgetMinInr),
          budgetMaxInr: Number(form.budgetMaxInr),
          projectId: form.projectId || null,
        }),
      });
      setShowCreate(false);
      setForm({ ...form, fullName: '', phone: '+91 ', email: '', aiSummary: '' });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create lead.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssign(leadId: string, assignedTo: string) {
    try {
      await apiFetch(`/api/leads/${leadId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignedTo }),
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Assignment failed.');
    }
  }

  async function handleUpdateLead(leadId: string, patch: { stage?: LeadStage; temperature?: LeadTemperature }) {
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, code, phone, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'hot', 'warm', 'cold'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTempFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tempFilter === t ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600 hover:text-[#0B1F3A]'
                }`}
              >
                {t === 'all' ? 'All Temps' : titleize(t)}
              </button>
            ))}
          </div>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">All Stages</option>
            {STAGES.map((st) => (
              <option key={st} value={st}>
                {titleize(st)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600'
              }`}
            >
              List View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'pipeline' ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600'
              }`}
            >
              Pipeline Board
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {viewMode === 'pipeline' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {(['new', 'qualified', 'site_visit_scheduled', 'negotiation'] as LeadStage[]).map((stageCol) => {
            const stageLeads = filtered.filter((l) =>
              stageCol === 'new'
                ? l.stage === 'new' || l.stage === 'contacted'
                : stageCol === 'site_visit_scheduled'
                ? l.stage === 'site_visit_scheduled' || l.stage === 'site_visit_done'
                : l.stage === stageCol
            );
            return (
              <div key={stageCol} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-[#0B1F3A]">
                    {stageCol === 'new'
                      ? 'New & Contacted'
                      : stageCol === 'site_visit_scheduled'
                      ? 'Site Visits'
                      : titleize(stageCol)}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {stageLeads.length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-4 text-center">No leads</p>
                  ) : (
                    stageLeads.map((lead) => (
                      <div key={lead.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#0B1F3A] truncate">{lead.fullName}</span>
                          <span
                            className={`text-[11px] font-semibold ${
                              lead.temperature === 'hot'
                                ? 'text-red-700'
                                : lead.temperature === 'warm'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {titleize(lead.temperature)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lead.preferredCity} · {titleize(lead.interestedCategory)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums font-semibold text-emerald-700">
                          {formatInrCompact(lead.budgetMaxInr)}
                        </div>
                        <div className="pt-1 flex items-center justify-between gap-2">
                          <select
                            value={lead.stage}
                            onChange={(e) => handleUpdateLead(lead.id, { stage: e.target.value as LeadStage })}
                            className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white"
                          >
                            {STAGES.map((st) => (
                              <option key={st} value={st}>
                                {titleize(st)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => onOpenBookingForLead(lead)}
                            className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Book
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      /* Leads Table */
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[960px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
              <th className="py-3 px-4">Lead &amp; Contact</th>
              <th className="py-3 px-3">Requirement &amp; Budget</th>
              <th className="py-3 px-3">Source / Lang</th>
              <th className="py-3 px-3">Temperature</th>
              <th className="py-3 px-3">Pipeline Stage</th>
              <th className="py-3 px-3">Assigned Executive</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  No leads match the selected filters.
                </td>
              </tr>
            ) : (
              filtered.map((lead) => {
                const assignee = employees.find((u) => u.id === lead.assignedTo);
                const tempColor =
                  lead.temperature === 'hot'
                    ? 'text-red-700'
                    : lead.temperature === 'warm'
                    ? 'text-amber-700'
                    : 'text-slate-500';
                return (
                  <tr key={lead.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0B1F3A]">{lead.fullName}</div>
                      <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                        {lead.leadCode} · {lead.phone}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {formatIstDateTime(lead.createdAt)}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-800">
                        {titleize(lead.interestedCategory)} · {titleize(lead.transactionIntent)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {lead.preferredCity}
                        {lead.preferredLocality ? ` · ${lead.preferredLocality}` : ''}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-emerald-700 font-medium mt-0.5">
                        {formatInrCompact(lead.budgetMinInr)} – {formatInrCompact(lead.budgetMaxInr)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      <div>{titleize(lead.source)}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {LANGUAGE_LABELS[lead.preferredLanguage] || lead.preferredLanguage}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={lead.temperature}
                        onChange={(e) =>
                          handleUpdateLead(lead.id, {
                            temperature: e.target.value as LeadTemperature,
                          })
                        }
                        className={`text-xs font-semibold border border-slate-200 rounded-md px-2 py-1 bg-white ${tempColor}`}
                      >
                        <option value="hot">Hot</option>
                        <option value="warm">Warm</option>
                        <option value="cold">Cold</option>
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={lead.stage}
                        onChange={(e) =>
                          handleUpdateLead(lead.id, { stage: e.target.value as LeadStage })
                        }
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-800"
                      >
                        {STAGES.map((st) => (
                          <option key={st} value={st}>
                            {titleize(st)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      {canAssign ? (
                        <select
                          value={lead.assignedTo || ''}
                          onChange={(e) => handleAssign(lead.id, e.target.value)}
                          className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-800"
                        >
                          <option value="">Unassigned</option>
                          {salesTeam.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.fullName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-700 font-medium">
                          {assignee?.fullName || 'Unassigned'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {lead.stage !== 'booked' ? (
                        <button
                          type="button"
                          onClick={() => onOpenBookingForLead(lead)}
                          className="px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] border border-slate-300 hover:border-emerald-600 hover:text-emerald-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Convert Booking
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">Booked</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Create Lead Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                <h3 className="text-base font-bold text-[#0B1F3A]">Create New Property Lead</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone (WhatsApp) *</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Preferred Language</label>
                <select
                  value={form.preferredLanguage}
                  onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Property Category</label>
                <select
                  value={form.interestedCategory}
                  onChange={(e) => setForm({ ...form, interestedCategory: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="apartment">Apartment</option>
                  <option value="villa">Villa</option>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="plot_land">Plot &amp; Land</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Transaction Intent</label>
                <select
                  value={form.transactionIntent}
                  onChange={(e) => setForm({ ...form, transactionIntent: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="primary_sale">Primary Sale</option>
                  <option value="resale">Resale</option>
                  <option value="rental">Rental</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">City *</label>
                <input
                  required
                  value={form.preferredCity}
                  onChange={(e) => setForm({ ...form, preferredCity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Source</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="website">Website</option>
                  <option value="magicbricks">MagicBricks</option>
                  <option value="99acres">99acres</option>
                  <option value="housing_com">Housing.com</option>
                  <option value="meta_ads">Meta Ads</option>
                  <option value="google_ads">Google Ads</option>
                  <option value="referral">Referral</option>
                  <option value="walk_in">Walk-In</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Min Budget (INR)</label>
                <input
                  type="number"
                  value={form.budgetMinInr}
                  onChange={(e) => setForm({ ...form, budgetMinInr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Max Budget (INR)</label>
                <input
                  type="number"
                  value={form.budgetMaxInr}
                  onChange={(e) => setForm({ ...form, budgetMaxInr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Project</label>
                <select
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">General / Resale / Rental</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.city})
                    </option>
                  ))}
                </select>
              </div>
              {canAssign && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assign To</label>
                  <select
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {salesTeam.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="sm:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
