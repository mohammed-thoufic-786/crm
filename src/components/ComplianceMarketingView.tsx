import React, { useState } from 'react';
import { Download, Megaphone, Play, ShieldCheck, UserCheck } from 'lucide-react';
import { apiFetch, getAuthToken } from '../services/api';
import { formatIstDateTime, titleize } from '../utils/format';
import type {
  CampaignRecord,
  ConsentRecord,
  CustomerRecord,
  ProjectRecord,
  UserRecord,
} from '../types';

interface ComplianceMarketingViewProps {
  currentUser: UserRecord;
  customers: CustomerRecord[];
  consent: ConsentRecord[];
  campaigns: CampaignRecord[];
  projects: ProjectRecord[];
  onRefresh: () => Promise<void>;
}

export function ComplianceMarketingView({
  currentUser,
  customers,
  consent,
  campaigns,
  projects,
  onRefresh,
}: ComplianceMarketingViewProps) {
  const [cmpForm, setCmpForm] = useState({
    name: '',
    channel: 'whatsapp',
    targetTemperature: 'all',
    targetCity: '',
    projectId: projects[0]?.id || '',
    templateMessage: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRunCampaigns =
    currentUser.roleCode === 'admin' || currentUser.roleCode === 'sales_manager';

  async function handleConsentToggle(rec: ConsentRecord, nextStatus: 'granted' | 'withdrawn' | 'opted_out') {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/consent/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(`Consent updated to ${titleize(nextStatus)} for ${rec.contactName}.`);
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update consent.');
    }
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          ...cmpForm,
          targetCity: cmpForm.targetCity || null,
          projectId: cmpForm.projectId || null,
        }),
      });
      setCmpForm({ ...cmpForm, name: '', templateMessage: '' });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create campaign.');
    }
  }

  async function handleRunCampaign(id: string) {
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch<CampaignRecord>(`/api/campaigns/${id}/run`, {
        method: 'POST',
      });
      setNotice(
        `Campaign "${updated.name}" sent to ${updated.sentCount} consented leads (${updated.skippedOptOutCount} opted-out contacts automatically skipped).`
      );
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to execute campaign.');
    }
  }

  async function handleDownloadCsv() {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/reports/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'avasa_leads_report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'CSV export failed.');
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
          {notice}
        </div>
      )}

      {/* Customer PII Database (Row-Level Protected) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-[#0B1F3A]">Customer Database (KYC &amp; Protected PII)</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentUser.roleCode === 'sales_exec'
                ? `Row-level isolation active: showing only customers assigned to ${currentUser.fullName}`
                : 'Showing verified buyers & tenants across projects with masked PAN'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 hover:border-[#0B1F3A] text-xs font-semibold text-[#0B1F3A] rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Leads CSV</span>
          </button>
        </div>

        <table className="w-full text-left border-collapse min-w-[780px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
              <th className="py-2.5 pr-3">Customer Name</th>
              <th className="py-2.5 px-2">Phone &amp; Email</th>
              <th className="py-2.5 px-2">PAN (Masked)</th>
              <th className="py-2.5 px-2">City &amp; Address</th>
              <th className="py-2.5 pl-2 text-right">KYC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="py-3 pr-3 font-semibold text-[#0B1F3A]">{c.fullName}</td>
                <td className="py-3 px-2 font-mono text-[11px] text-slate-600">
                  <div>{c.phone}</div>
                  <div>{c.email}</div>
                </td>
                <td className="py-3 px-2 font-mono text-slate-700">{c.panMasked}</td>
                <td className="py-3 px-2 text-slate-600">
                  <div className="font-medium text-slate-800">{c.city}</div>
                  <div className="text-[11px] text-slate-500">{c.correspondenceAddress}</div>
                </td>
                <td className="py-3 pl-2 text-right font-semibold text-emerald-700">
                  {c.kycVerified ? 'Verified' : 'Pending'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Consent & Opt-Out Management (DPDP Act 2023) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-[#0B1F3A]">DPDP Consent &amp; Opt-Out Registry</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Withdrawing consent immediately locks automated WhatsApp AI replies and cancels drip follow-ups.
        </p>

        <table className="w-full text-left border-collapse min-w-[780px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
              <th className="py-2.5 pr-3">Contact</th>
              <th className="py-2.5 px-2">Channel / Purpose</th>
              <th className="py-2.5 px-2">Proof</th>
              <th className="py-2.5 px-2">Updated (IST)</th>
              <th className="py-2.5 px-2">Status</th>
              <th className="py-2.5 pl-2 text-right">Consent Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {consent.map((rec) => (
              <tr key={rec.id}>
                <td className="py-3 pr-3">
                  <div className="font-semibold text-[#0B1F3A]">{rec.contactName}</div>
                  <div className="text-[11px] font-mono text-slate-500">{rec.phone}</div>
                </td>
                <td className="py-3 px-2 text-slate-700">
                  {titleize(rec.channel)} · {titleize(rec.purpose)}
                </td>
                <td className="py-3 px-2 text-[11px] text-slate-500">{rec.sourceProof}</td>
                <td className="py-3 px-2 font-mono text-[11px] text-slate-500">
                  {formatIstDateTime(rec.updatedAt)}
                </td>
                <td className="py-3 px-2">
                  <span
                    className={`font-semibold ${
                      rec.status === 'granted' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {titleize(rec.status)}
                  </span>
                </td>
                <td className="py-3 pl-2 text-right space-x-2">
                  {rec.status === 'granted' ? (
                    <button
                      type="button"
                      onClick={() => handleConsentToggle(rec, 'withdrawn')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-red-700 border border-red-300 rounded-md hover:bg-red-50 cursor-pointer"
                    >
                      Withdraw Consent
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConsentToggle(rec, 'granted')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-300 rounded-md hover:bg-emerald-50 cursor-pointer"
                    >
                      Re-Grant Opt-In
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Marketing Automation Campaigns */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-[#0B1F3A]">Marketing Automation Campaigns</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {campaigns.map((cmp) => (
              <div key={cmp.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs max-w-lg">
                  <div className="font-bold text-[#0B1F3A]">{cmp.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {titleize(cmp.channel)} · Target: {titleize(cmp.targetTemperature)}
                    {cmp.targetCity ? ` · ${cmp.targetCity}` : ' · All Cities'} · Status: {titleize(cmp.status)}
                  </div>
                  <p className="text-slate-600 mt-1">{cmp.templateMessage}</p>
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    Sent: {cmp.sentCount} · Skipped (Opt-Out): {cmp.skippedOptOutCount}
                  </div>
                </div>
                {canRunCampaigns && (
                  <button
                    type="button"
                    onClick={() => handleRunCampaign(cmp.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B1F3A] hover:bg-[#132D52] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Run Campaign</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {canRunCampaigns && (
          <form
            onSubmit={handleCreateCampaign}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs"
          >
            <h4 className="text-sm font-bold text-[#0B1F3A]">Create WhatsApp / Drip Campaign</h4>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Campaign Name *</label>
              <input
                required
                value={cmpForm.name}
                onChange={(e) => setCmpForm({ ...cmpForm, name: e.target.value })}
                placeholder="Weekend Open House Invite"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Temp</label>
                <select
                  value={cmpForm.targetTemperature}
                  onChange={(e) => setCmpForm({ ...cmpForm, targetTemperature: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">All Leads</option>
                  <option value="hot">Hot Only</option>
                  <option value="warm">Warm Only</option>
                  <option value="cold">Cold Nurture</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target City</label>
                <input
                  value={cmpForm.targetCity}
                  onChange={(e) => setCmpForm({ ...cmpForm, targetCity: e.target.value })}
                  placeholder="All Cities"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Template Message *</label>
              <textarea
                required
                rows={3}
                value={cmpForm.templateMessage}
                onChange={(e) => setCmpForm({ ...cmpForm, templateMessage: e.target.value })}
                placeholder="Reply STOP to opt out..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
            >
              Save Campaign Draft
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
