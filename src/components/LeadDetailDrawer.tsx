import React from 'react';
import {
  X,
  Target,
  Send,
  Building2,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import type { Lead } from '../data';

interface LeadDetailDrawerProps {
  lead: Lead | null;
  onClose: () => void;
  onComposeOutreach: (lead: Lead) => void;
}

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  lead,
  onClose,
  onComposeOutreach,
}) => {
  if (!lead) return null;

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 16, 12, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 110,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prospect Dossier"
        style={{
          width: '540px',
          maxWidth: '92vw',
          height: '100vh',
          background: '#ffffff',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          animation: 'drawer-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid #eef2ed',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            background: '#fafcfa',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div className={`avatar avatar-${lead.color}`} style={{ width: 48, height: 48, fontSize: 16 }}>
              {lead.initials}
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#46672c' }}>
                PROSPECT DOSSIER
              </div>
              <h2 style={{ margin: '2px 0 0', fontSize: '20px', fontWeight: 700, color: '#142019' }}>
                {lead.name}
              </h2>
              <span style={{ fontSize: '13px', color: '#637367' }}>
                {lead.role} <i>at</i> <strong>{lead.company}</strong>
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dossier"
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

        {/* Drawer Body */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '22px', flex: 1 }}>
          {/* Intent Gauge Card */}
          <div
            style={{
              background: '#f6faf3',
              border: '1px solid #dce8d6',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#46672c', letterSpacing: '0.7px' }}>
                BUYING INTENT SCORE
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: 2 }}>
                <span style={{ fontSize: '32px', fontWeight: 800, color: '#1b3211', fontFamily: 'Manrope, sans-serif' }}>
                  {lead.intent}
                </span>
                <span style={{ fontSize: '13px', color: '#6a7d6e', fontWeight: 600 }}>/ 100 Verified Intent</span>
              </div>
              <span style={{ fontSize: '11px', color: '#556858' }}>
                High intent indicates clear budget, urgency, or platform pain.
              </span>
            </div>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(201, 243, 106, 0.4)',
                border: '2px solid #b8e64c',
                display: 'grid',
                placeItems: 'center',
                color: '#213a0e',
              }}
            >
              <Target size={22} />
            </div>
          </div>

          {/* Signal & Context Box */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#7a8a7e', marginBottom: 8 }}>
              CAPTURED INTENT SIGNAL
            </div>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8e0',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    background: '#edf4ea',
                    color: '#2a4817',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {lead.source}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: '#7a8a7e' }}>
                  <Calendar size={12} />
                  <span>{lead.fetchedDate} · {lead.fetchedTime}</span>
                </div>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  lineHeight: '1.55',
                  color: '#1a271f',
                  fontStyle: 'italic',
                }}
              >
                “{lead.excerpt}”
              </p>
            </div>
          </div>

          {/* Account Intelligence */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#7a8a7e', marginBottom: 8 }}>
              ACCOUNT INTELLIGENCE
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#f9fbf8', border: '1px solid #e7ede5', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: '10px', color: '#7b8c7f', fontWeight: 600 }}>COMPANY</div>
                <strong style={{ fontSize: '13px', color: '#17231c', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={13} /> {lead.company}
                </strong>
              </div>
              <div style={{ background: '#f9fbf8', border: '1px solid #e7ede5', padding: '12px 14px', borderRadius: 8 }}>
                <div style={{ fontSize: '10px', color: '#7b8c7f', fontWeight: 600 }}>SENIORITY LEVEL</div>
                <strong style={{ fontSize: '13px', color: '#17231c', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={13} color="#457022" /> Executive / Decision Maker
                </strong>
              </div>
            </div>
          </div>

          {/* Recommended Outreach Angles */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#7a8a7e', marginBottom: 8 }}>
              RECOMMENDED AI OUTREACH ANGLES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ background: '#f9faf8', border: '1px solid #e7eee5', borderRadius: 8, padding: '10px 14px' }}>
                <strong style={{ fontSize: '12.5px', color: '#1f3025', display: 'block' }}>
                  1. Migration Readiness Checklist
                </strong>
                <span style={{ fontSize: '11.5px', color: '#68776b' }}>
                  Offer the 6-phase framework as an ungated resource tailored to their exact scale.
                </span>
              </div>
              <div style={{ background: '#f9faf8', border: '1px solid #e7eee5', borderRadius: 8, padding: '10px 14px' }}>
                <strong style={{ fontSize: '12.5px', color: '#1f3025', display: 'block' }}>
                  2. Peer Benchmark Teardown
                </strong>
                <span style={{ fontSize: '11.5px', color: '#68776b' }}>
                  Reference how comparable operations leaders avoided data downtime during cutovers.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div
          style={{
            padding: '18px 28px',
            borderTop: '1px solid #eef2ed',
            background: '#fafcfa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11.5px', color: '#6a7b6e' }}>
            <ShieldCheck size={14} color="#3c6b1d" />
            <span>Review context before outreach</span>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              onClose();
              onComposeOutreach(lead);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              background: '#c9f36a',
              color: '#142019',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Send size={14} />
            Draft personalized outreach
          </button>
        </div>
      </div>
    </div>
  );
};
