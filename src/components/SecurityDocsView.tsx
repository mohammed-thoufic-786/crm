import React, { useEffect, useState } from 'react';
import { Copy, Database, Download, FileText, Lock, Shield, Users } from 'lucide-react';
import { apiFetch } from '../services/api';
import { formatInrCompact, formatIstDateTime, titleize } from '../utils/format';
import type { AuditLogRecord, PermissionRecord, RoleCode, RoleRecord, UserRecord } from '../types';

interface SecurityDocsViewProps {
  currentUser: UserRecord;
  employees: UserRecord[];
  onRefresh: () => Promise<void>;
}

interface DocItem {
  slug: string;
  title: string;
  category: string;
  content: string;
}

export function SecurityDocsView({ currentUser, employees, onRefresh }: SecurityDocsViewProps) {
  const [tab, setTab] = useState<'team' | 'sql' | 'docs' | 'audit'>('sql');
  const [sqlFile, setSqlFile] = useState<'001_schema.sql' | '002_rls_and_indexes.sql' | '003_seed_data.sql'>('001_schema.sql');
  const [sqlContent, setSqlContent] = useState('');
  const [selectedTable, setSelectedTable] = useState('leads');
  const [tablePreview, setTablePreview] = useState<{
    table: string;
    rowCount: number;
    rlsScoped: boolean;
    rows: Array<Record<string, unknown>>;
  } | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [selectedDocSlug, setSelectedDocSlug] = useState('deployment');
  const [rolesData, setRolesData] = useState<{
    roles: RoleRecord[];
    permissions: PermissionRecord[];
    rolePermissions: Record<RoleCode, string[]>;
  } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [backupResult, setBackupResult] = useState<{
    filename: string;
    sizeBytes: number;
    recordCounts: Record<string, number>;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [empForm, setEmpForm] = useState({
    fullName: '',
    email: '',
    phone: '+91 ',
    city: 'Bengaluru',
    roleCode: 'sales_exec',
    monthlyTargetInr: '30000000',
  });

  const isAdmin = currentUser.roleCode === 'admin';

  useEffect(() => {
    apiFetch<{ sql: string }>(`/api/database/sql/${sqlFile}`)
      .then((res) => setSqlContent(res.sql))
      .catch(() => {});
  }, [sqlFile]);

  useEffect(() => {
    apiFetch<{
      table: string;
      rowCount: number;
      rlsScoped: boolean;
      rows: Array<Record<string, unknown>>;
    }>(`/api/database/tables/${selectedTable}`)
      .then(setTablePreview)
      .catch(() => {});
  }, [selectedTable, currentUser.id]);

  useEffect(() => {
    apiFetch<DocItem[]>('/api/docs').then(setDocs).catch(() => {});
    apiFetch<{
      roles: RoleRecord[];
      permissions: PermissionRecord[];
      rolePermissions: Record<RoleCode, string[]>;
    }>('/api/roles')
      .then(setRolesData)
      .catch(() => {});
    if (isAdmin) {
      apiFetch<AuditLogRecord[]>('/api/audit-logs').then(setAuditLogs).catch(() => {});
    }
  }, [isAdmin]);

  async function handleCopySql() {
    await navigator.clipboard.writeText(sqlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownloadSql() {
    const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sqlFile;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateBackup() {
    setError(null);
    try {
      const res = await apiFetch<{
        filename: string;
        sizeBytes: number;
        recordCounts: Record<string, number>;
      }>('/api/database/backup', { method: 'POST' });
      setBackupResult(res);
      if (isAdmin) {
        const logs = await apiFetch<AuditLogRecord[]>('/api/audit-logs');
        setAuditLogs(logs);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Backup failed.');
    }
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          ...empForm,
          monthlyTargetInr: Number(empForm.monthlyTargetInr),
        }),
      });
      setEmpForm({ ...empForm, fullName: '', email: '', phone: '+91 ' });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to add employee.');
    }
  }

  const activeDoc = docs.find((d) => d.slug === selectedDocSlug) || docs[0];

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              ['sql', 'PostgreSQL Sample SQL & Backups'],
              ['team', 'Team, Roles & RBAC'],
              ['docs', 'Manuals, API & Deployment Docs'],
              ...(isAdmin ? [['audit', 'Security Audit Logs']] : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as typeof tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === id ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600 hover:text-[#0B1F3A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleCreateBackup}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Database className="w-4 h-4" />
            <span>Create Database Backup</span>
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {backupResult && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          <div className="font-bold">Snapshot Created: {backupResult.filename}</div>
          <div className="mt-1 font-mono">
            Size: {backupResult.sizeBytes.toLocaleString('en-IN')} bytes · Leads: {backupResult.recordCounts.leads} · Bookings: {backupResult.recordCounts.bookings} · Audit Logs: {backupResult.recordCounts.auditLogs}
          </div>
        </div>
      )}

      {/* Sample SQL Tab */}
      {tab === 'sql' && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0B1F3A]">
                Production PostgreSQL 16 Migrations &amp; Sample SQL
              </h3>
              <p className="text-xs text-slate-500">
                17 relational tables, foreign keys, indexes, Row-Level Security (RLS), consent withdrawal triggers, and Indian real estate seed data
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied' : 'Copy SQL'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSql}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .sql</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-lg w-fit">
            {(
              [
                ['001_schema.sql', '001_schema.sql (17 Tables)'],
                ['002_rls_and_indexes.sql', '002_rls_and_indexes.sql (RLS & Retention)'],
                ['003_seed_data.sql', '003_seed_data.sql (Sample Indian Data)'],
              ] as const
            ).map(([file, label]) => (
              <button
                key={file}
                type="button"
                onClick={() => setSqlFile(file)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  sqlFile === file ? 'bg-white text-[#0B1F3A] shadow-xs' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <pre className="p-4 rounded-xl bg-[#061326] text-emerald-200 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[380px]">
            {sqlContent}
          </pre>

          {/* Built-in Live 17-Table Data Explorer (No external PostgreSQL needed) */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#0B1F3A]">
                  Live Sample Database Explorer (19 Tables)
                </h4>
                <p className="text-xs text-slate-500">
                  Inspect live seeded rows directly in demo mode{tablePreview?.rlsScoped ? ' · Row-Level Security active for Sales Exec' : ''}
                </p>
              </div>
              {tablePreview && (
                <span className="text-xs font-mono text-emerald-700 font-semibold">
                  SELECT * FROM {tablePreview.table} ({tablePreview.rowCount} rows)
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                'leads',
                'customers',
                'projects',
                'properties',
                'conversations',
                'messages',
                'consent',
                'site_visits',
                'bookings',
                'payments',
                'invoices',
                'advance_token_receipts',
                'commissions',
                'follow_ups',
                'campaigns',
                'users',
                'roles',
                'permissions',
                'audit_logs',
              ].map((tbl) => (
                <button
                  key={tbl}
                  type="button"
                  onClick={() => setSelectedTable(tbl)}
                  className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors cursor-pointer ${
                    selectedTable === tbl
                      ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-600'
                  }`}
                >
                  {tbl}
                </button>
              ))}
            </div>

            {tablePreview && tablePreview.rows.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-72">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      {Object.keys(tablePreview.rows[0])
                        .slice(0, 7)
                        .map((col) => (
                          <th key={col} className="py-2 px-3 font-mono font-semibold text-slate-600 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tablePreview.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {Object.keys(tablePreview.rows[0])
                          .slice(0, 7)
                          .map((col) => (
                            <td key={col} className="py-2 px-3 font-mono text-slate-700 max-w-[220px] truncate">
                              {row[col] === null || row[col] === undefined
                                ? 'NULL'
                                : typeof row[col] === 'object'
                                ? JSON.stringify(row[col])
                                : String(row[col])}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-xs text-slate-500 border border-slate-200 rounded-lg">
                No visible rows in {selectedTable} for the current role ({currentUser.roleName}).
              </div>
            )}
          </div>
        </section>
      )}

      {/* Team & RBAC Tab */}
      {tab === 'team' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  Team Directory ({employees.length} Active Users · 5–15 Sales Capacity)
                </h3>
              </div>
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2 pr-3">Name &amp; Email</th>
                    <th className="py-2 px-2">Role</th>
                    <th className="py-2 px-2">City</th>
                    <th className="py-2 px-2 text-right">Monthly Target</th>
                    <th className="py-2 pl-2 text-right">Commission %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {employees.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[#0B1F3A]">{u.fullName}</div>
                        <div className="text-[11px] font-mono text-slate-500">{u.email}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-700">{u.roleName}</td>
                      <td className="py-2.5 px-2 text-slate-600">{u.city}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        {u.monthlyTargetInr > 0 ? formatInrCompact(u.monthlyTargetInr) : '—'}
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono tabular-nums">
                        {u.commissionRatePct > 0 ? `${u.commissionRatePct}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isAdmin && (
              <form
                onSubmit={handleAddEmployee}
                className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs"
              >
                <h4 className="text-sm font-bold text-[#0B1F3A]">Add Employee</h4>
                <input
                  required
                  placeholder="Full Name"
                  value={empForm.fullName}
                  onChange={(e) => setEmpForm({ ...empForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  required
                  type="email"
                  placeholder="Work Email"
                  value={empForm.email}
                  onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  required
                  placeholder="Phone (+91...)"
                  value={empForm.phone}
                  onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={empForm.roleCode}
                    onChange={(e) => setEmpForm({ ...empForm, roleCode: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="sales_exec">Sales Executive</option>
                    <option value="sales_manager">Sales Manager</option>
                    <option value="finance">Finance</option>
                    <option value="admin">Admin</option>
                  </select>
                  <input
                    value={empForm.city}
                    onChange={(e) => setEmpForm({ ...empForm, city: e.target.value })}
                    placeholder="City"
                    className="px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-[#0B1F3A] hover:bg-[#132D52] text-white font-semibold rounded-lg cursor-pointer"
                >
                  Create Employee Account
                </button>
              </form>
            )}
          </div>

          {rolesData && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-[#0B1F3A]">RBAC Permissions Matrix</h3>
              </div>
              <table className="w-full text-left border-collapse min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2 pr-3">Permission</th>
                    {rolesData.roles.map((r) => (
                      <th key={r.code} className="py-2 px-3 text-center">
                        {r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rolesData.permissions.map((perm) => (
                    <tr key={perm.code}>
                      <td className="py-2.5 pr-3">
                        <div className="font-mono font-semibold text-[#0B1F3A]">{perm.code}</div>
                        <div className="text-[11px] text-slate-500">{perm.description}</div>
                      </td>
                      {rolesData.roles.map((r) => {
                        const granted = (rolesData.rolePermissions[r.code] || []).includes(perm.code);
                        return (
                          <td key={r.code} className="py-2.5 px-3 text-center font-mono font-bold">
                            {granted ? (
                              <span className="text-emerald-700">ALLOW</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Docs Tab */}
      {tab === 'docs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-3 space-y-1 h-fit">
            {docs.map((d) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => setSelectedDocSlug(d.slug)}
                className={`w-full text-left p-3 rounded-lg transition-colors cursor-pointer ${
                  activeDoc?.slug === d.slug
                    ? 'bg-[#0B1F3A] text-white'
                    : 'hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="text-[11px] opacity-75">{d.category}</div>
                <div className="text-xs font-semibold mt-0.5">{d.title}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
            {activeDoc ? (
              <div>
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-semibold mb-2">
                  <FileText className="w-4 h-4" />
                  <span>{activeDoc.category}</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {activeDoc.content}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Audit Logs Tab */}
      {tab === 'audit' && isAdmin && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-[#0B1F3A]">Immutable Security &amp; PII Audit Trail</h3>
          </div>
          <table className="w-full text-left border-collapse min-w-[740px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2 pr-3">Timestamp (IST)</th>
                <th className="py-2 px-2">Actor</th>
                <th className="py-2 px-2">Action</th>
                <th className="py-2 px-2">Entity</th>
                <th className="py-2 pl-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-500">
                    {formatIstDateTime(log.createdAt)}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="font-semibold text-[#0B1F3A]">{log.actorName}</span>
                    {log.actorRole ? ` · ${titleize(log.actorRole)}` : ''}
                  </td>
                  <td className="py-2.5 px-2 font-mono font-semibold text-emerald-700">{log.action}</td>
                  <td className="py-2.5 px-2 font-mono text-slate-600">
                    {log.entityType}
                    {log.entityId ? `:${log.entityId}` : ''}
                  </td>
                  <td className="py-2.5 pl-2 font-mono text-[11px] text-slate-500">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
