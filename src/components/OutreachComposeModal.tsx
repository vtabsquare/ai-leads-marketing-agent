import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Linkedin,
  Mail,
  Copy,
  Sparkles,
  ShieldCheck,
  Check,
  LoaderCircle,
  ArrowRight,
} from 'lucide-react';
import type { Lead } from '../data';
import { generateCampaignWithGemini } from '../lib/gemini';

interface OutreachComposeModalProps {
  lead: Lead | null;
  onClose: () => void;
  onSendForApproval: (lead: Lead, message: string, channel: 'linkedin' | 'email') => void;
}

export const OutreachComposeModal: React.FC<OutreachComposeModalProps> = ({
  lead,
  onClose,
  onSendForApproval,
}) => {
  const [channel, setChannel] = useState<'linkedin' | 'email'>('linkedin');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!lead) return;
    const defaultSubject = `Quick question regarding ${lead.company}'s migration timeline`;
    setSubject(defaultSubject);

    // Initial draft tailored to lead
    const defaultBody = `Hi ${lead.name.split(' ')[0]} — saw your note about ${lead.excerpt.toLowerCase().replace(/[“”.!]+$/, '')}.\n\nWe put together a short readiness checklist for teams thinking about a move. It might help you map the first steps without adding noise to your process.\n\nWant me to send the 1-page summary over?`;
    setMessage(defaultBody);
  }, [lead]);

  if (!lead) return null;

  const handleRegenerateWithGemini = async () => {
    setGenerating(true);
    try {
      const result = await generateCampaignWithGemini(
        `Personalized outreach for ${lead.name} (${lead.role} at ${lead.company}) who noted: "${lead.excerpt}"`,
        'VTAB Square Knowledge Base'
      );
      if (channel === 'linkedin') {
        setMessage(result.personalizedDm?.body || message);
      } else {
        setSubject(result.coldEmail?.subject || subject);
        setMessage(`${result.coldEmail?.touch1}\n\n${result.coldEmail?.touch2}\n\n${result.coldEmail?.touch3}`);
      }
    } catch (err) {
      console.warn('Gemini outreach generation fallback:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(channel === 'email' ? `Subject: ${subject}\n\n${message}` : message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 16, 12, 0.72)',
        backdropFilter: 'blur(5px)',
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compose Outreach"
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          width: '640px',
          maxWidth: '94vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          border: '1px solid #e2e8e0',
          overflow: 'hidden',
        }}
      >
        {/* Modal Top */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #eef2ed',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            background: '#fafcfa',
          }}
        >
          <div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '10px',
                fontWeight: 700,
                color: '#46672c',
                background: 'rgba(201, 243, 106, 0.3)',
                padding: '3px 8px',
                borderRadius: 4,
                marginBottom: 4,
              }}
            >
              <Sparkles size={11} /> 1:1 OUTBOUND DISPATCH
            </span>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#142019' }}>
              Draft Outreach for {lead.name}
            </h2>
            <span style={{ fontSize: '12px', color: '#68776b' }}>
              {lead.role} · {lead.company} ({lead.intent} Intent)
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#637367',
              padding: 6,
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
          {/* Channel Selector */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setChannel('linkedin')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: channel === 'linkedin' ? '2px solid #0a66c2' : '1px solid #e1e7de',
                background: channel === 'linkedin' ? '#f0f7fd' : '#ffffff',
                color: channel === 'linkedin' ? '#0a66c2' : '#49574d',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <Linkedin size={16} /> LinkedIn InMail / Message
            </button>
            <button
              type="button"
              onClick={() => setChannel('email')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: channel === 'email' ? '2px solid #142019' : '1px solid #e1e7de',
                background: channel === 'email' ? '#f5f7f5' : '#ffffff',
                color: channel === 'email' ? '#142019' : '#49574d',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <Mail size={16} /> Direct Work Email
            </button>
          </div>

          {/* Email Subject Line (if email) */}
          {channel === 'email' && (
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#57675a', marginBottom: 4 }}>
                SUBJECT LINE
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d4ded1',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Message Area */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: '#57675a' }}>
                MESSAGE CONTENT
              </label>
              <button
                type="button"
                onClick={handleRegenerateWithGemini}
                disabled={generating}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#284617',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {generating ? <LoaderCircle size={13} className="step-spinner" /> : <Sparkles size={13} />}
                {generating ? 'Gemini rewriting…' : 'Regenerate with Gemini'}
              </button>
            </div>
            <textarea
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid #d4ded1',
                fontSize: '13.5px',
                lineHeight: '1.5',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Signal context snippet */}
          <div style={{ background: '#f8faf7', border: '1px solid #e7ede5', borderRadius: 8, padding: '10px 14px', fontSize: '12px', color: '#68776b' }}>
            <strong>Signal excerpt:</strong> “{lead.excerpt}”
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #eef2ed',
            background: '#fafcfa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#67776b' }}>
            <ShieldCheck size={14} color="#356116" />
            <span>Sends only upon operator review</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                borderRadius: 7,
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid #d4ded1',
                background: '#ffffff',
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={14} color="#2b5015" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                onSendForApproval(lead, message, channel);
                onClose();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                background: '#c9f36a',
                color: '#142019',
                border: 'none',
                borderRadius: 7,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Send size={14} />
              Send to Approval Queue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
