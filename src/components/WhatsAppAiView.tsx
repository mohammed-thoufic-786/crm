import React, { useEffect, useState } from 'react';
import { Bot, MessageSquare, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { apiFetch } from '../services/api';
import { formatIstDateTime, LANGUAGE_LABELS, titleize } from '../utils/format';
import type { ConversationRecord, MessageRecord } from '../types';

export interface EnrichedConversation extends ConversationRecord {
  leadName: string;
  leadCode: string;
  temperature: string;
  optedOut: boolean;
  messages: MessageRecord[];
}

interface WhatsAppAiViewProps {
  onRefreshDashboard: () => Promise<void>;
}

const INDIAN_SAMPLE_MESSAGES = [
  {
    label: 'Hindi (Devanagari)',
    text: 'नमस्ते, मुझे बेंगलुरु के व्हाइटफील्ड में 3 BHK फ्लैट चाहिए, बजट 1.7 करोड़ है। क्या इस शनिवार को साइट विजिट मिल सकती है?',
  },
  {
    label: 'Hinglish',
    text: 'Bhaiya Hyderabad Mokila mein 4 BHK villa ka best price kya chal raha hai? Ready to move chahiye.',
  },
  {
    label: 'Tamil',
    text: 'வணக்கம், புனே Hinjewadi-யில் 2400 sq.ft பிளாட் விலை என்ன? RERA விவரம் அனுப்பவும்.',
  },
  {
    label: 'Telugu',
    text: 'హాయ్, గురుగ్రామ్‌లో కమర్షియల్ ఆఫీస్ స్పేస్ ఉందా? ధర ఎంత ఉంటుంది?',
  },
  {
    label: 'Opt-Out (STOP)',
    text: 'STOP',
  },
];

export function WhatsAppAiView({ onRefreshDashboard }: WhatsAppAiViewProps) {
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agentInput, setAgentInput] = useState('');
  const [simPhone, setSimPhone] = useState('');
  const [simName, setSimName] = useState('');
  const [simText, setSimText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  async function loadConversations() {
    try {
      const data = await apiFetch<EnrichedConversation[]>('/api/whatsapp/conversations');
      setConversations(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load WhatsApp conversations.');
    }
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeConv = conversations.find((c) => c.id === selectedId) || conversations[0] || null;

  async function handleSimulateIncoming(e: React.FormEvent) {
    e.preventDefault();
    if (!simText.trim()) return;
    setBusy(true);
    setError(null);
    setStatusNotice(null);
    try {
      const payload = activeConv && !simPhone.trim()
        ? { leadId: activeConv.leadId, text: simText.trim(), triggerAi: true }
        : {
            phone: simPhone.trim() || '+91 98112 44090',
            senderName: simName.trim() || 'Asha Deshpande',
            text: simText.trim(),
            triggerAi: true,
          };

      const res = await apiFetch<{
        conversation: ConversationRecord;
        optedOut: boolean;
        aiAnalysis?: { detectedLanguage: string; detectedIntent: string } | null;
      }>('/api/whatsapp/incoming', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSimText('');
      setSimPhone('');
      setSimName('');
      await loadConversations();
      setSelectedId(res.conversation.id);
      await onRefreshDashboard();

      if (res.optedOut) {
        setStatusNotice('Contact replied STOP — opt-out enforced & AI paused immediately.');
      } else if (res.aiAnalysis) {
        setStatusNotice(
          `AI detected ${LANGUAGE_LABELS[res.aiAnalysis.detectedLanguage] || res.aiAnalysis.detectedLanguage} (${titleize(res.aiAnalysis.detectedIntent)}) and replied.`
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process incoming WhatsApp message.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendAgentReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConv || !agentInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/whatsapp/outgoing', {
        method: 'POST',
        body: JSON.stringify({ conversationId: activeConv.id, body: agentInput.trim() }),
      });
      setAgentInput('');
      await loadConversations();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send WhatsApp message.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTriggerAiReply() {
    if (!activeConv) return;
    setBusy(true);
    setError(null);
    setStatusNotice(null);
    try {
      const res = await apiFetch<{
        analysis: { detectedLanguage: string; detectedIntent: string };
      }>('/api/ai/reply', {
        method: 'POST',
        body: JSON.stringify({ conversationId: activeConv.id }),
      });
      await loadConversations();
      setStatusNotice(
        `Gemini AI generated response in ${LANGUAGE_LABELS[res.analysis.detectedLanguage] || res.analysis.detectedLanguage}.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI reply failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
          {error}
        </div>
      )}
      {statusNotice && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
          {statusNotice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Conversation Threads */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[680px]">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-[#0B1F3A]">WhatsApp Business Inbox</h3>
            <p className="text-[11px] text-slate-500">
              Multilingual AI conversations &amp; consent-guarded threads
            </p>
          </div>
          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {conversations.map((conv) => {
              const selected = activeConv?.id === conv.id;
              const lastMsg = conv.messages[conv.messages.length - 1];
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selected ? 'bg-slate-100/90' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0B1F3A] truncate">{conv.leadName}</span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {LANGUAGE_LABELS[conv.detectedLanguage] || conv.detectedLanguage}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {conv.waPhone} · {titleize(conv.temperature)}
                    {conv.optedOut ? ' · Opted Out' : ''}
                  </div>
                  {lastMsg && (
                    <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{lastMsg.body}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Active Chat + Incoming WhatsApp & AI Simulator */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[460px]">
            {activeConv ? (
              <>
                <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-sm font-bold text-[#0B1F3A]">{activeConv.leadName}</h4>
                      <span className="text-xs text-slate-500 font-mono">{activeConv.waPhone}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {activeConv.leadCode} · Language: {LANGUAGE_LABELS[activeConv.detectedLanguage] || activeConv.detectedLanguage} · Status: {titleize(activeConv.status)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || activeConv.optedOut}
                    onClick={handleTriggerAiReply}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B1F3A] hover:bg-[#132D52] disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{busy ? 'Thinking...' : 'Generate AI Reply'}</span>
                  </button>
                </div>

                {activeConv.optedOut && (
                  <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs text-red-700 font-medium">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>
                      Customer opted out of WhatsApp updates (DPDP Consent Withdrawn). Outbound replies are blocked.
                    </span>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50">
                  {activeConv.messages.map((msg) => {
                    const isInbound = msg.direction === 'inbound';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                            isInbound
                              ? 'bg-white border border-slate-200 text-slate-800'
                              : msg.senderType === 'ai_bot'
                              ? 'bg-[#0B1F3A] text-white'
                              : 'bg-emerald-700 text-white'
                          }`}
                        >
                          <div className="text-[10px] opacity-75 mb-1 flex items-center gap-1.5">
                            {msg.senderType === 'ai_bot' && <Bot className="w-3 h-3" />}
                            <span>
                              {msg.senderType === 'customer'
                                ? activeConv.leadName
                                : msg.senderType === 'ai_bot'
                                ? 'Avasa AI Advisor'
                                : 'Sales Executive'}
                            </span>
                            <span>·</span>
                            <span>{formatIstDateTime(msg.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{msg.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  onSubmit={handleSendAgentReply}
                  className="p-3 border-t border-slate-200 flex items-center gap-2 bg-white rounded-b-xl"
                >
                  <input
                    type="text"
                    disabled={activeConv.optedOut || busy}
                    placeholder={
                      activeConv.optedOut
                        ? 'Messaging blocked — contact opted out'
                        : 'Type manual WhatsApp reply as sales executive...'
                    }
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="submit"
                    disabled={activeConv.optedOut || busy || !agentInput.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                Select or simulate a WhatsApp conversation to begin.
              </div>
            )}
          </div>

          {/* Incoming Customer Simulator (Multilingual + Opt-out Testing) */}
          <form
            onSubmit={handleSimulateIncoming}
            className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-[#0B1F3A]">
                  Incoming WhatsApp Webhook Simulator &amp; Indian Language Tester
                </h4>
                <p className="text-[11px] text-slate-500">
                  Test live customer inbound messages in Hindi, Hinglish, Tamil, Telugu, or STOP opt-out
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {INDIAN_SAMPLE_MESSAGES.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => setSimText(sample.text)}
                    className="px-2.5 py-1 text-[11px] font-medium border border-slate-200 rounded-md hover:border-emerald-600 hover:text-emerald-700 text-slate-700 cursor-pointer"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Optional new phone (+91...)"
                value={simPhone}
                onChange={(e) => setSimPhone(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                placeholder="Optional prospect name"
                value={simName}
                onChange={(e) => setSimName(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <div className="text-[11px] text-slate-500 flex items-center">
                Leave blank to message {activeConv?.leadName || 'selected lead'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                placeholder="Enter incoming WhatsApp customer message in any Indian language..."
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-[#0B1F3A] hover:bg-[#132D52] disabled:opacity-50 text-white text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
              >
                {busy ? 'Processing...' : 'Receive + AI Reply'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
