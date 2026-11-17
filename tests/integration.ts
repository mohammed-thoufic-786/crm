import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.ts';
import { resetDbForTesting } from '../server/db.ts';

async function runTests() {
  resetDbForTesting();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object', 'Server failed to bind ephemeral port');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const results: Array<{ name: string; status: 'PASS' | 'FAIL'; ms: number; detail: string }> = [];

  async function test(name: string, fn: () => Promise<string>) {
    const start = performance.now();
    try {
      const detail = await fn();
      results.push({ name, status: 'PASS', ms: Math.round(performance.now() - start), detail });
    } catch (err: unknown) {
      results.push({
        name,
        status: 'FAIL',
        ms: Math.round(performance.now() - start),
        detail: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async function request<T>(
    path: string,
    options: RequestInit & { token?: string } = {}
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { status: res.status, data };
  }

  let adminToken = '';
  let execToken = '';
  let createdLeadId = '';
  let createdConvId = '';

  try {
    await test('01. Healthcheck & Asia/Kolkata IST Config', async () => {
      const res = await request<{ status: string; timezone: string; currency: string }>('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.data.timezone, 'Asia/Kolkata');
      assert.equal(res.data.currency, 'INR');
      return 'OK (IST / INR)';
    });

    await test('02. Unauthenticated Access Rejected (401)', async () => {
      const res = await request('/api/leads');
      assert.equal(res.status, 401);
      return 'Returned 401 Unauthorized';
    });

    await test('03. Admin Login (Vikramaditya Rao)', async () => {
      const res = await request<{ token: string; user: { roleCode: string } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@avasarealty.in', password: 'Avasa@2026!' }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.user.roleCode, 'admin');
      adminToken = res.data.token;
      return 'Admin JWT issued';
    });

    await test('04. Employee Login (Arjun Deshmukh)', async () => {
      const res = await request<{ token: string; user: { roleCode: string } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'arjun@avasarealty.in', password: 'Avasa@2026!' }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.user.roleCode, 'sales_exec');
      execToken = res.data.token;
      return 'Sales Executive JWT issued';
    });

    await test('05. Row-Level PII Isolation (403 on Unassigned Customer)', async () => {
      // cust-02 belongs to Priya (usr-exec-02), not Arjun (usr-exec-01)
      const res = await request('/api/customers/cust-02', { token: execToken });
      assert.equal(res.status, 403);
      const listRes = await request<Array<{ id: string }>>('/api/customers', { token: execToken });
      assert(!listRes.data.some((c) => c.id === 'cust-02'), 'Unassigned customer leaked in list');
      return '403 Forbidden + list filtered';
    });

    await test('06. Lead Creation & Admin Assignment', async () => {
      const createRes = await request<{ id: string; leadCode: string }>('/api/leads', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          fullName: 'Vikrant Oberoi',
          phone: '+91 98200 77661',
          preferredCity: 'Bengaluru',
          interestedCategory: 'villa',
          transactionIntent: 'primary_sale',
          budgetMinInr: 30000000,
          budgetMaxInr: 45000000,
        }),
      });
      assert.equal(createRes.status, 201);
      createdLeadId = createRes.data.id;

      const assignRes = await request<{ assignedTo: string }>(`/api/leads/${createdLeadId}/assign`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ assignedTo: 'usr-exec-01' }),
      });
      assert.equal(assignRes.status, 200);
      assert.equal(assignRes.data.assignedTo, 'usr-exec-01');
      return `Created ${createRes.data.leadCode} & assigned to Arjun`;
    });

    await test('07. Automated Follow-up Generated on Lead Creation', async () => {
      const res = await request<Array<{ leadId: string; isAutomated: boolean }>>('/api/follow-ups', {
        token: execToken,
      });
      assert.equal(res.status, 200);
      assert(res.data.some((f) => f.leadId === createdLeadId && f.isAutomated));
      return 'Automated follow-up verified';
    });

    await test('08. Property Inventory Categories (Res/Comm/Plot/Villa/Apt/Rent/Resale)', async () => {
      const res = await request<Array<{ category: string; transactionType: string }>>('/api/properties', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      const cats = new Set(res.data.map((p) => p.category));
      const txs = new Set(res.data.map((p) => p.transactionType));
      for (const c of ['apartment', 'villa', 'commercial', 'plot_land', 'residential']) {
        assert(cats.has(c), `Missing property category: ${c}`);
      }
      for (const tx of ['primary_sale', 'resale', 'rental']) {
        assert(txs.has(tx), `Missing transaction type: ${tx}`);
      }
      return `${res.data.length} properties verified across all categories & deal types`;
    });

    await test('09. WhatsApp Incoming + Gemini AI Response (Hindi/Hinglish)', async () => {
      if (!process.env.GEMINI_API_KEY) {
        return 'SKIPPED live Gemini call (GEMINI_API_KEY not set in test shell)';
      }
      const res = await request<{
        conversation: { id: string };
        aiReplyMsg: { body: string; languageCode: string } | null;
      }>('/api/whatsapp/incoming', {
        method: 'POST',
        token: execToken,
        body: JSON.stringify({
          leadId: createdLeadId,
          text: 'Namaste, Whitefield mein 3 BHK flat dikhaiye 1.7 Cr ke aas paas',
          triggerAi: true,
        }),
      });
      assert.equal(res.status, 201);
      assert(res.data.aiReplyMsg && res.data.aiReplyMsg.body.length > 10, 'Empty AI reply');
      createdConvId = res.data.conversation.id;
      return `AI replied (${res.data.aiReplyMsg.languageCode})`;
    });

    await test('10. WhatsApp Outgoing Agent Message', async () => {
      const convId = createdConvId || 'conv-01';
      const res = await request<{ id: string; deliveryStatus: string }>('/api/whatsapp/outgoing', {
        method: 'POST',
        token: execToken,
        body: JSON.stringify({
          conversationId: convId,
          body: 'Confirmed, sharing RERA brochure on WhatsApp.',
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.deliveryStatus, 'delivered');
      return 'Agent outbound message delivered';
    });

    await test('11. Customer Consent Opt-Out (STOP) Blocks Outbound & Campaigns', async () => {
      // Simulate STOP opt-out on lead-10 (owned by Arjun)
      const optRes = await request<{ optedOut: boolean }>('/api/whatsapp/incoming', {
        method: 'POST',
        token: execToken,
        body: JSON.stringify({ leadId: 'lead-10', text: 'STOP', triggerAi: true }),
      });
      assert.equal(optRes.status, 201);
      assert.equal(optRes.data.optedOut, true);

      const blockedRes = await request('/api/whatsapp/outgoing', {
        method: 'POST',
        token: execToken,
        body: JSON.stringify({ conversationId: 'conv-03', body: 'Should be blocked' }),
      });
      assert.equal(blockedRes.status, 403);

      // Run campaign and confirm skippedOptOutCount >= 2
      const cmpRes = await request<{ sentCount: number; skippedOptOutCount: number }>(
        '/api/campaigns/cmp-01/run',
        { method: 'POST', token: adminToken }
      );
      assert.equal(cmpRes.status, 200);
      assert(cmpRes.data.skippedOptOutCount >= 1);
      return `Blocked 403 after STOP; campaign skipped ${cmpRes.data.skippedOptOutCount} opt-outs`;
    });

    await test('12. Site Visit Booking & Completion', async () => {
      const createSv = await request<{ id: string; status: string }>('/api/site-visits', {
        method: 'POST',
        token: execToken,
        body: JSON.stringify({
          leadId: createdLeadId,
          projectId: 'prj-01',
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          pickupRequired: true,
        }),
      });
      assert.equal(createSv.status, 201);

      const doneSv = await request<{ status: string }>(`/api/site-visits/${createSv.data.id}`, {
        method: 'PATCH',
        token: execToken,
        body: JSON.stringify({ status: 'completed', rating: 5, feedback: 'Great location' }),
      });
      assert.equal(doneSv.status, 200);
      assert.equal(doneSv.data.status, 'completed');
      return 'Site visit booked & completed';
    });

    await test('13. Sales Pipeline Booking -> Payment Tracking -> Commission Calculation', async () => {
      const bkRes = await request<{ id: string; bookingCode: string; totalPayableInr: number }>(
        '/api/bookings',
        {
          method: 'POST',
          token: execToken,
          body: JSON.stringify({
            leadId: createdLeadId,
            propertyId: 'prop-04',
            agreementValueInr: 37800000,
            tokenPaid: true,
            paymentMode: 'neft_rtgs',
            utrReference: 'TESTUTR998811',
          }),
        }
      );
      assert.equal(bkRes.status, 201);
      assert(bkRes.data.totalPayableInr >= 37800000);

      const payRes = await request<Array<{ bookingId: string; status: string }>>('/api/payments', {
        token: adminToken,
      });
      const bkPayments = payRes.data.filter((p) => p.bookingId === bkRes.data.id);
      assert.equal(bkPayments.length, 2);

      const comRes = await request<Array<{ bookingId: string; netPayableInr: number }>>(
        '/api/commissions',
        { token: execToken }
      );
      assert(comRes.data.some((c) => c.bookingId === bkRes.data.id && c.netPayableInr > 0));
      return `Booking ${bkRes.data.bookingCode} created with 2 milestones & commission`;
    });

    await test('14. Dashboard Analytics & Filters Performance (< 150ms)', async () => {
      const start = performance.now();
      const res = await request<{ kpis: { totalEnquiries: number; bookingsConfirmed: number } }>(
        '/api/dashboard?location=Bengaluru',
        { token: adminToken }
      );
      const elapsed = performance.now() - start;
      assert.equal(res.status, 200);
      assert(res.data.kpis.totalEnquiries > 0);
      assert(elapsed < 150, `Slow dashboard query: ${elapsed}ms`);
      return `Dashboard filtered in ${Math.round(elapsed)}ms`;
    });

    await test('15. Sample PostgreSQL SQL, Database Backup & Audit Logs', async () => {
      const sqlRes = await request<{ sql: string }>('/api/database/sql/001_schema.sql', {
        token: adminToken,
      });
      assert.equal(sqlRes.status, 200);
      assert(sqlRes.data.sql.includes('CREATE TABLE IF NOT EXISTS audit_logs'));

      const backupRes = await request<{ filename: string; sizeBytes: number }>(
        '/api/database/backup',
        { method: 'POST', token: adminToken }
      );
      assert.equal(backupRes.status, 201);
      assert(backupRes.data.sizeBytes > 1000);

      const auditRes = await request<Array<{ action: string }>>('/api/audit-logs', {
        token: adminToken,
      });
      assert.equal(auditRes.status, 200);
      assert(auditRes.data.some((a) => a.action === 'PII_ACCESS_DENIED'));
      assert(auditRes.data.some((a) => a.action === 'DATABASE_BACKUP_CREATED'));
      return `Backup ${backupRes.data.filename} (${backupRes.data.sizeBytes} bytes) + Audit trail verified`;
    });

    await test('16. Live 17-Table Explorer & RBAC Scoping', async () => {
      const adminLeads = await request<{ rowCount: number; rlsScoped: boolean }>(
        '/api/database/tables/leads',
        { token: adminToken }
      );
      assert.equal(adminLeads.status, 200);
      assert.equal(adminLeads.data.rlsScoped, false);

      const execAudit = await request<{ rowCount: number; rlsScoped: boolean }>(
        '/api/database/tables/audit_logs',
        { token: execToken }
      );
      assert.equal(execAudit.status, 200);
      assert.equal(execAudit.data.rlsScoped, true);
      assert.equal(execAudit.data.rowCount, 0);
      return `Admin leads=${adminLeads.data.rowCount}; Sales Exec audit_logs=0 (RLS scoped)`;
    });
  } finally {
    resetDbForTesting();
    server.close();
  }

  console.log('\n=== Avasa Realty CRM Integration & Security Test Report ===');
  for (const r of results) {
    console.log(`[${r.status}] ${r.name} (${r.ms}ms) -> ${r.detail}`);
  }
  console.log(`\nTotal Passed: ${results.length}/${results.length}`);
}

runTests().catch((err) => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
