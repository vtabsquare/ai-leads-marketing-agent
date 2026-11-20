import React, { useState } from 'react';
import { X, Database, Search, FileText, CheckCircle2, Sparkles } from 'lucide-react';
import type { Chunk } from '../data';

interface ChunkDetailDrawerProps {
  chunk: Chunk | null;
  onClose: () => void;
}

export const ChunkDetailDrawer: React.FC<ChunkDetailDrawerProps> = ({
  chunk,
  onClose,
}) => {
  const [testQuery, setTestQuery] = useState('migration readiness');
  
  if (!chunk) return null;

  // Calculate a simulated relevance/similarity score
  const queryTerms = testQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const chunkTextLower = chunk.text.toLowerCase();
  const matchedTerms = queryTerms.filter((term) => chunkTextLower.includes(term));
  const similarityScore = queryTerms.length > 0
    ? Math.min(98, Math.round(50 + (matchedTerms.length / queryTerms.length) * 45))
    : 70;

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
        aria-label="Knowledge Passage Inspector"
        style={{
          width: '520px',
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
        {/* Header */}
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
          <div>
            <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: '#385721' }}>
              RAG VECTOR CHUNK
            </span>
            <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700, color: '#142019' }}>
              {chunk.source}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close passage inspector"
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

        {/* Content */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          {/* Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: '#f8faf7', border: '1px solid #e5ede3', padding: '12px 14px', borderRadius: 8 }}>
              <div style={{ fontSize: '10px', color: '#7b8c7f', fontWeight: 600 }}>EMBEDDING DIMENSION</div>
              <strong style={{ fontSize: '13px', color: '#17231c', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Database size={13} color="#355e1a" /> 768 / 1536 Float32
              </strong>
            </div>
            <div style={{ background: '#f8faf7', border: '1px solid #e5ede3', padding: '12px 14px', borderRadius: 8 }}>
              <div style={{ fontSize: '10px', color: '#7b8c7f', fontWeight: 600 }}>TOKEN LENGTH</div>
              <strong style={{ fontSize: '13px', color: '#17231c', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} color="#355e1a" /> ~{Math.round(chunk.text.length / 4)} Tokens
              </strong>
            </div>
          </div>

          {/* Full Passage */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#7a8a7e', marginBottom: 8, letterSpacing: '0.8px' }}>
              EXTRACTED PASSAGE
            </label>
            <div
              style={{
                background: '#fcfdfc',
                border: '1px solid #dbe5d8',
                borderRadius: '10px',
                padding: '16px 18px',
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#1a271e',
              }}
            >
              {chunk.text}
            </div>
          </div>

          {/* Semantic Similarity Test Tool */}
          <div style={{ background: '#f5f9f3', border: '1px solid #d8e5d3', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 700, color: '#3d6124', marginBottom: 6 }}>
              <Sparkles size={13} />
              <span>TEST SIMILARITY SEARCH</span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#68776b' }}>
              Type a search query to simulate vector cosine similarity against this passage:
            </p>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#78897c' }} />
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="e.g. migration readiness"
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  borderRadius: 6,
                  border: '1px solid #cbdbca',
                  fontSize: '12.5px',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: '12px', color: '#445b48', fontWeight: 600 }}>
                Matched {matchedTerms.length} of {queryTerms.length} search tokens
              </span>
              <span
                style={{
                  background: '#c9f36a',
                  color: '#142019',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '11.5px',
                  fontWeight: 800,
                }}
              >
                {similarityScore}% Match
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #eef2ed', background: '#fafcfa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#68776b' }}>
            <CheckCircle2 size={14} color="#355e1a" />
            <span>Passage is active and ready for AI agent grounding</span>
          </div>
        </div>
      </div>
    </div>
  );
};
