import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Database,
  ExternalLink,
  Eye,
  FileCode,
  Layers,
  Linkedin,
  LoaderCircle,
  Mail,
  Maximize2,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Workflow,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  CampaignWorkflow,
  NodeCategory,
  WorkflowEdge,
  WorkflowNode,
} from './workflowsData';

const categoryColors: Record<
  NodeCategory,
  {
    iconBg: string;
    iconColor: string;
    badgeBg: string;
    badgeColor: string;
    accent: string;
    label: string;
  }
> = {
  trigger: {
    iconBg: 'rgba(182, 240, 76, 0.16)',
    iconColor: '#b6f04c',
    badgeBg: 'rgba(182, 240, 76, 0.12)',
    badgeColor: '#b6f04c',
    accent: '#b6f04c',
    label: 'TRIGGER',
  },
  rag: {
    iconBg: 'rgba(56, 189, 248, 0.16)',
    iconColor: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.12)',
    badgeColor: '#38bdf8',
    accent: '#38bdf8',
    label: 'KNOWLEDGE',
  },
  router: {
    iconBg: 'rgba(192, 132, 252, 0.16)',
    iconColor: '#c084fc',
    badgeBg: 'rgba(192, 132, 252, 0.12)',
    badgeColor: '#c084fc',
    accent: '#c084fc',
    label: 'ROUTER',
  },
  agent: {
    iconBg: 'rgba(52, 211, 153, 0.16)',
    iconColor: '#34d399',
    badgeBg: 'rgba(52, 211, 153, 0.12)',
    badgeColor: '#34d399',
    accent: '#34d399',
    label: 'AI AGENT',
  },
  guardrail: {
    iconBg: 'rgba(251, 146, 60, 0.16)',
    iconColor: '#fb923c',
    badgeBg: 'rgba(251, 146, 60, 0.12)',
    badgeColor: '#fb923c',
    accent: '#fb923c',
    label: 'GUARDRAIL',
  },
  action: {
    iconBg: 'rgba(163, 230, 53, 0.16)',
    iconColor: '#a3e635',
    badgeBg: 'rgba(163, 230, 53, 0.12)',
    badgeColor: '#a3e635',
    accent: '#a3e635',
    label: 'ACTION',
  },
};

function getNodeIcon(node: WorkflowNode): LucideIcon {
  if (node.id.includes('trigger')) return Zap;
  if (node.id.includes('rag')) return Database;
  if (node.id.includes('router')) return Bot;
  if (node.id.includes('copywriter')) return Sparkles;
  if (node.id.includes('art-director')) return Eye;
  if (node.id.includes('outreach')) return Send;
  if (node.id.includes('guardrail')) return ShieldCheck;
  if (node.id.includes('dispatch')) return Share2;
  return categoryColors[node.category]?.iconBg ? Sparkles : Workflow;
}

export function WorkflowsPage({
  workflows,
  onNavigate,
  onToast,
  onCreateCampaign,
}: {
  workflows: CampaignWorkflow[];
  onNavigate: (page: any) => void;
  onToast: (toast: { title: string; detail?: string }) => void;
  onCreateCampaign?: () => void;
}) {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Completed' | 'Running'>('All');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'params' | 'input' | 'output'>('params');
  const [zoom, setZoom] = useState(0.9);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeSimNodeId, setActiveSimNodeId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showOutputsModal, setShowOutputsModal] = useState(false);
  const [isActiveToggle, setIsActiveToggle] = useState(true);

  // Active selected workflow
  const activeWorkflow = useMemo(() => {
    return workflows.find((w) => w.id === selectedWorkflowId) ?? null;
  }, [workflows, selectedWorkflowId]);

  // Selected node
  const activeNode = useMemo(() => {
    if (!activeWorkflow || !selectedNodeId) return null;
    return activeWorkflow.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [activeWorkflow, selectedNodeId]);

  // Filtered workflows for list view
  const filteredWorkflows = useMemo(() => {
    return workflows.filter((w) => {
      const matchesSearch =
        w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.brief.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesFilter =
        filterStatus === 'All' ? true : w.status === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [workflows, searchQuery, filterStatus]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
      onToast({ title: 'Copied to clipboard', detail: 'Payload copied successfully.' });
    } catch {
      onToast({ title: 'Clipboard error', detail: 'Unable to access clipboard.' });
    }
  };

  // Run test execution animation on the n8n canvas
  const handleTestRun = () => {
    if (!activeWorkflow || isSimulating) return;
    setIsSimulating(true);
    onToast({
      title: 'Executing workflow',
      detail: `Testing ${activeWorkflow.title} across ${activeWorkflow.nodes.length} nodes…`,
    });

    const nodeSequence = activeWorkflow.nodes.map((n) => n.id);
    let step = 0;
    const interval = window.setInterval(() => {
      if (step < nodeSequence.length) {
        setActiveSimNodeId(nodeSequence[step]);
        step++;
      } else {
        window.clearInterval(interval);
        setActiveSimNodeId(null);
        setIsSimulating(false);
        onToast({
          title: 'Workflow completed successfully',
          detail: `All ${activeWorkflow.nodes.length} nodes executed without errors (${activeWorkflow.duration} runtime).`,
        });
      }
    }, 650);
  };

  // Render SVG connector bezier paths - pixel-perfect alignment
  const renderEdge = (edge: WorkflowEdge, nodes: WorkflowNode[]) => {
    const fromNode = nodes.find((n) => n.id === edge.from);
    const toNode = nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return null;

    // Node dimension: width = 220, height = 68. Vertical center = 34.
    const fromX = fromNode.position.x + 220;
    const fromY = fromNode.position.y + 34;
    const toX = toNode.position.x;
    const toY = toNode.position.y + 34;

    const deltaX = Math.max(25, (toX - fromX) * 0.5);
    const pathD = `M ${fromX} ${fromY} C ${fromX + deltaX} ${fromY}, ${toX - deltaX} ${toY}, ${toX} ${toY}`;

    const isEdgeActive =
      isSimulating &&
      (activeSimNodeId === edge.from || activeSimNodeId === edge.to);

    return (
      <g key={edge.id} className="n8n-edge-group">
        {/* Glow halo when executing */}
        {isEdgeActive && (
          <path
            d={pathD}
            fill="none"
            stroke="#b6f04c"
            strokeWidth="5"
            strokeOpacity="0.4"
            strokeLinecap="round"
          />
        )}
        {/* Main Bezier Line with directional arrow */}
        <path
          d={pathD}
          fill="none"
          stroke={isEdgeActive ? '#b6f04c' : '#4b5568'}
          strokeWidth={isEdgeActive ? '2.5' : '1.8'}
          strokeDasharray={isEdgeActive ? '6 6' : undefined}
          markerEnd={isEdgeActive ? 'url(#n8n-arrow-active)' : 'url(#n8n-arrow)'}
          className={isEdgeActive ? 'n8n-edge-flowing' : 'n8n-edge-base'}
        />
        {/* Source handle dot */}
        <circle
          cx={fromX}
          cy={fromY}
          r="2.5"
          fill={isEdgeActive ? '#b6f04c' : '#64748b'}
        />
      </g>
    );
  };

  // If in Detail / Canvas Mode
  if (activeWorkflow) {
    return (
      <div className="n8n-canvas-wrapper">
        {/* Authentic n8n Header Toolbar */}
        <div className="n8n-topbar">
          <div className="n8n-topbar-left">
            <button
              className="n8n-back-btn"
              onClick={() => {
                setSelectedWorkflowId(null);
                setSelectedNodeId(null);
              }}
            >
              <ArrowLeft size={15} />
              <span>Workflows</span>
            </button>
            <div className="n8n-topbar-divider" />
            <div className="n8n-workflow-heading">
              <h2>{activeWorkflow.title}</h2>
              <div className="n8n-sub-info">
                <span>Knowledge: <strong>{activeWorkflow.knowledgeBase}</strong></span>
                <span>•</span>
                <span>Created {activeWorkflow.createdAt}</span>
                <span>•</span>
                <span>Runtime: {activeWorkflow.duration}</span>
              </div>
            </div>
          </div>

          <div className="n8n-topbar-right">
            {/* Activation Switch Toggle (n8n signature) */}
            <div className="n8n-active-toggle-wrap">
              <span className="toggle-label">{isActiveToggle ? 'Active' : 'Inactive'}</span>
              <button
                type="button"
                className={`n8n-switch ${isActiveToggle ? 'is-on' : ''}`}
                onClick={() => {
                  setIsActiveToggle(!isActiveToggle);
                  onToast({
                    title: !isActiveToggle ? 'Workflow activated' : 'Workflow paused',
                    detail: !isActiveToggle
                      ? 'Automated triggers and listening webhooks are enabled.'
                      : 'Workflow is now in draft mode.',
                  });
                }}
                role="switch"
                aria-checked={isActiveToggle}
                aria-label="Toggle workflow active state"
              >
                <span />
              </button>
            </div>

            <button
              className="n8n-btn-secondary"
              onClick={() => setShowOutputsModal(true)}
            >
              <Eye size={14} />
              <span>View Deliverables ({activeWorkflow.itemsProduced})</span>
            </button>

            <button
              className="n8n-btn-execute"
              onClick={handleTestRun}
              disabled={isSimulating}
            >
              {isSimulating ? (
                <>
                  <LoaderCircle size={14} className="n8n-spin" />
                  <span>Testing…</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  <span>Test workflow</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Canvas Viewport with n8n Dot Matrix */}
        <div className="n8n-canvas-viewport">
          <div
            className="n8n-canvas-surface"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            {/* SVG Edges Layer */}
            <svg
              className="n8n-svg-layer"
              width="1700"
              height="480"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <marker
                  id="n8n-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 1 2 L 8 5 L 1 8 z" fill="#64748b" />
                </marker>
                <marker
                  id="n8n-arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 1 2 L 8 5 L 1 8 z" fill="#b6f04c" />
                </marker>
              </defs>
              {activeWorkflow.edges.map((edge) =>
                renderEdge(edge, activeWorkflow.nodes)
              )}
            </svg>

            {/* Authentic n8n Nodes */}
            {activeWorkflow.nodes.map((node) => {
              const meta = categoryColors[node.category];
              const Icon = getNodeIcon(node);
              const isSelected = selectedNodeId === node.id;
              const isExecutingNow = activeSimNodeId === node.id;

              return (
                <div
                  key={node.id}
                  className={`n8n-node ${isSelected ? 'is-selected' : ''} ${
                    isExecutingNow ? 'is-executing' : ''
                  }`}
                  style={{
                    transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                  }}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  {/* Left Connection Handle */}
                  {node.category !== 'trigger' && (
                    <div className="n8n-port port-input" title="Input Port">
                      <div className="port-dot" />
                    </div>
                  )}

                  {/* Right Connection Handle */}
                  {node.category !== 'action' && (
                    <div className="n8n-port port-output" title="Output Port">
                      <div className="port-dot" />
                    </div>
                  )}

                  {/* Icon Box on Left */}
                  <div
                    className="n8n-node-icon"
                    style={{
                      background: meta.iconBg,
                      color: meta.iconColor,
                    }}
                  >
                    <Icon size={17} strokeWidth={2.2} />
                  </div>

                  {/* Text Details in Middle */}
                  <div className="n8n-node-info">
                    <span className="n8n-node-name">{node.name}</span>
                    <span className="n8n-node-sub">{node.subtitle}</span>
                  </div>

                  {/* Right Status / Count Meta */}
                  <div className="n8n-node-meta">
                    {isExecutingNow ? (
                      <span className="status-running-badge">
                        <LoaderCircle size={10} className="n8n-spin" />
                      </span>
                    ) : (
                      <span
                        className="status-check-badge"
                        title={`Success · ${node.executionTime}`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                    <span className="items-count-badge">
                      {node.itemsCount || '1 item'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Floating Canvas Controls Dock (Bottom Left, n8n signature) */}
          <div className="n8n-floating-dock">
            <button
              className="dock-btn"
              onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="dock-zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              className="dock-btn"
              onClick={() => setZoom((z) => Math.min(1.4, Math.round((z + 0.1) * 10) / 10))}
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <div className="dock-divider" />
            <button
              className="dock-btn"
              onClick={() => setZoom(0.9)}
              title="Fit to view (90%)"
            >
              <Maximize2 size={13} />
            </button>
          </div>

          {/* n8n Node Inspector Panel (Slide-Over Drawer) */}
          {activeNode && (
            <div className="n8n-inspector">
              <div className="n8n-inspector-header">
                <div className="inspector-left">
                  <div
                    className="inspector-icon-wrap"
                    style={{
                      background: categoryColors[activeNode.category].iconBg,
                      color: categoryColors[activeNode.category].iconColor,
                    }}
                  >
                    {React.createElement(getNodeIcon(activeNode), {
                      size: 20,
                      strokeWidth: 2,
                    })}
                  </div>
                  <div>
                    <div className="inspector-name-row">
                      <h3>{activeNode.name}</h3>
                      <span
                        className="category-badge"
                        style={{
                          background: categoryColors[activeNode.category].badgeBg,
                          color: categoryColors[activeNode.category].badgeColor,
                        }}
                      >
                        {categoryColors[activeNode.category].label}
                      </span>
                    </div>
                    <span className="inspector-subtitle">{activeNode.subtitle}</span>
                  </div>
                </div>
                <button
                  className="inspector-close"
                  onClick={() => setSelectedNodeId(null)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Status bar */}
              <div className="n8n-inspector-status-bar">
                <div className="status-item">
                  <span className="status-dot-green" />
                  <strong>Success (200 OK)</strong>
                </div>
                <div className="status-item">
                  <span>Duration:</span>
                  <code>{activeNode.executionTime}</code>
                </div>
              </div>

              {/* Tabs */}
              <div className="n8n-inspector-tabs">
                <button
                  className={inspectorTab === 'params' ? 'active' : ''}
                  onClick={() => setInspectorTab('params')}
                >
                  <Sliders size={13} />
                  Parameters
                </button>
                <button
                  className={inspectorTab === 'input' ? 'active' : ''}
                  onClick={() => setInspectorTab('input')}
                >
                  <FileCode size={13} />
                  Input Data
                </button>
                <button
                  className={inspectorTab === 'output' ? 'active' : ''}
                  onClick={() => setInspectorTab('output')}
                >
                  <Sparkles size={13} />
                  Output Data
                </button>
              </div>

              {/* Tab Contents */}
              <div className="n8n-inspector-content">
                {inspectorTab === 'params' && (
                  <div className="inspector-params-pane">
                    <div className="summary-callout">
                      <span className="callout-label">Execution Summary</span>
                      <p>{activeNode.summary}</p>
                    </div>

                    <div className="params-list">
                      <span className="section-title">Node Configuration</span>
                      {Object.entries(activeNode.config).map(([key, val]) => (
                        <div className="param-item" key={key}>
                          <span className="param-key">{key}</span>
                          <span className="param-value">{String(val)}</span>
                        </div>
                      ))}
                    </div>

                    <button
                      className="n8n-test-step-btn"
                      onClick={() => {
                        onToast({
                          title: `Executed ${activeNode.name}`,
                          detail: `Step verified successfully (${activeNode.executionTime}).`,
                        });
                      }}
                    >
                      <Play size={13} fill="currentColor" />
                      Test step
                    </button>
                  </div>
                )}

                {inspectorTab === 'input' && (
                  <div className="inspector-json-pane">
                    <div className="json-head">
                      <span>INCOMING CONTEXT</span>
                      <button
                        className="copy-btn"
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(activeNode.inputData, null, 2),
                            'input'
                          )
                        }
                      >
                        <Copy size={12} />
                        {copiedKey === 'input' ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>
                    <pre className="n8n-code-view">
                      {JSON.stringify(activeNode.inputData, null, 2)}
                    </pre>
                  </div>
                )}

                {inspectorTab === 'output' && (
                  <div className="inspector-json-pane">
                    <div className="json-head">
                      <span>RESOLVED OUTPUT</span>
                      <button
                        className="copy-btn"
                        onClick={() =>
                          copyToClipboard(
                            JSON.stringify(activeNode.outputData, null, 2),
                            'output'
                          )
                        }
                      >
                        <Copy size={12} />
                        {copiedKey === 'output' ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>
                    <pre className="n8n-code-view">
                      {JSON.stringify(activeNode.outputData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* View Outputs Deliverables Modal */}
        {showOutputsModal && (
          <div
            className="outputs-modal-overlay"
            onClick={() => setShowOutputsModal(false)}
          >
            <div
              className="outputs-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="outputs-modal-head">
                <div>
                  <span className="eyebrow">CAMPAIGN DELIVERABLES</span>
                  <h2>{activeWorkflow.title}</h2>
                  <p>3 multi-agent outputs generated by this workflow run.</p>
                </div>
                <button
                  className="modal-close-btn"
                  onClick={() => setShowOutputsModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="outputs-grid">
                {/* Social Post */}
                {activeWorkflow.outputs.social && (
                  <div className="output-card">
                    <div className="output-card-head">
                      <div className="output-card-tag tag-social">
                        <Linkedin size={13} />
                        <span>Social Post</span>
                      </div>
                      <button
                        className="card-copy-btn"
                        onClick={() =>
                          copyToClipboard(
                            activeWorkflow.outputs.social?.body || '',
                            'social-modal'
                          )
                        }
                      >
                        <Copy size={12} />
                        {copiedKey === 'social-modal' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <h4>{activeWorkflow.outputs.social.headline}</h4>
                    <p className="output-body-text">
                      {activeWorkflow.outputs.social.body}
                    </p>
                    <div className="output-tags">
                      {activeWorkflow.outputs.social.tags.map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Art Direction */}
                {activeWorkflow.outputs.artDirection && (
                  <div className="output-card">
                    <div className="output-card-head">
                      <div className="output-card-tag tag-art">
                        <Sparkles size={13} />
                        <span>Art Direction</span>
                      </div>
                      <span className="format-badge">
                        {activeWorkflow.outputs.artDirection.aspectRatio}
                      </span>
                    </div>
                    <h4>{activeWorkflow.outputs.artDirection.title}</h4>
                    <div className="art-direction-spec">
                      <div className="art-banner-preview">
                        <span>{activeWorkflow.outputs.artDirection.headline}</span>
                      </div>
                      <p className="art-caption">
                        {activeWorkflow.outputs.artDirection.caption}
                      </p>
                    </div>
                  </div>
                )}

                {/* 1:1 Outreach DM */}
                {activeWorkflow.outputs.dm && (
                  <div className="output-card">
                    <div className="output-card-head">
                      <div className="output-card-tag tag-dm">
                        <Send size={13} />
                        <span>Personalized DM</span>
                      </div>
                      <span className="intent-score-badge">
                        {activeWorkflow.outputs.dm.intent} Intent
                      </span>
                    </div>
                    <div className="dm-lead-info">
                      <strong>{activeWorkflow.outputs.dm.recipient}</strong>
                      <span>{activeWorkflow.outputs.dm.role}</span>
                    </div>
                    <p className="output-body-text dm-body">
                      “{activeWorkflow.outputs.dm.body}”
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Workflows History List View
  return (
    <div className="workflows-page">
      {/* Page Header */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUTOMATION / CAMPAIGN RUNS</div>
          <h1>Workflows</h1>
          <p>
            Audit, inspect and orchestrate multi-agent marketing pipelines. Click
            any workflow to inspect the node graph in our n8n-inspired canvas.
          </p>
        </div>
        <div className="page-heading-actions">
          <button
            className="primary-button"
            onClick={() => {
              if (onCreateCampaign) onCreateCampaign();
              else onNavigate('marketing');
            }}
          >
            <Plus size={15} strokeWidth={2} />
            Create Campaign
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <section className="workflow-metrics-strip">
        <div className="metric-pill">
          <span className="metric-icon-wrap lime">
            <Workflow size={15} />
          </span>
          <div className="metric-text">
            <strong>{workflows.length}</strong>
            <span>Campaign Workflows</span>
          </div>
        </div>

        <div className="metric-pill">
          <span className="metric-icon-wrap emerald">
            <CheckCircle2 size={15} />
          </span>
          <div className="metric-text">
            <strong>{workflows.length > 0 ? '99.4%' : '—'}</strong>
            <span>Node Success Rate</span>
          </div>
        </div>

        <div className="metric-pill">
          <span className="metric-icon-wrap sky">
            <Clock size={15} />
          </span>
          <div className="metric-text">
            <strong>{workflows.length > 0 ? '3.9s' : '—'}</strong>
            <span>Avg Pipeline Speed</span>
          </div>
        </div>

        <div className="metric-pill">
          <span className="metric-icon-wrap purple">
            <Bot size={15} />
          </span>
          <div className="metric-text">
            <strong>3 Agents</strong>
            <span>Parallel Coordination</span>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div className="workflow-list-controls">
        <div className="workflow-search-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search campaigns by topic, keyword or brief…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="workflow-status-filters">
          {(['All', 'Completed', 'Running'] as const).map((status) => (
            <button
              key={status}
              className={`filter-pill ${
                filterStatus === status ? 'active' : ''
              }`}
              onClick={() => setFilterStatus(status)}
            >
              {status}
              <span className="pill-count">
                {status === 'All'
                  ? workflows.length
                  : workflows.filter((w) => w.status === status).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Workflows Cards Grid */}
      <div className="workflow-cards-grid">
        {filteredWorkflows.map((wf) => (
          <div
            key={wf.id}
            className="workflow-history-card"
            onClick={() => setSelectedWorkflowId(wf.id)}
          >
            {/* Top row */}
            <div className="history-card-top">
              <div className="card-badge-row">
                <span
                  className={`status-pill ${
                    wf.status === 'Completed'
                      ? 'status-completed'
                      : 'status-running'
                  }`}
                >
                  <i />
                  {wf.status}
                </span>
                <span className="trigger-tag">
                  <Zap size={10} />
                  {wf.triggerType}
                </span>
              </div>
              <span className="history-card-time">{wf.createdAt}</span>
            </div>

            {/* Title & Brief */}
            <div className="history-card-main">
              <h3>{wf.title}</h3>
              <p className="history-card-brief">{wf.brief}</p>
            </div>

            {/* Visual Mini Pipeline (n8n node chain preview) */}
            <div className="mini-pipeline-preview">
              <div className="pipeline-step-node lime" title="Campaign Brief Trigger">
                <Zap size={11} />
              </div>
              <div className="pipeline-connector-line" />
              <div className="pipeline-step-node sky" title="Vtab RAG Retrieval">
                <Database size={11} />
              </div>
              <div className="pipeline-connector-line" />
              <div className="pipeline-step-node purple" title="3 Subagents (Copy, Art, Outreach)">
                <Sparkles size={11} />
              </div>
              <div className="pipeline-connector-line" />
              <div className="pipeline-step-node amber" title="Human Review Guardrail">
                <ShieldCheck size={11} />
              </div>
              <div className="pipeline-connector-line" />
              <div className="pipeline-step-node green" title="Omnichannel Dispatch">
                <Share2 size={11} />
              </div>
            </div>

            {/* Meta tags & Knowledge base */}
            <div className="history-card-meta">
              <div className="card-kb-badge">
                <BookOpen size={12} />
                <span>{wf.knowledgeBase}</span>
              </div>
              <div className="card-stats">
                <span>{wf.nodes.length} nodes</span>
                <span>•</span>
                <span>{wf.duration}</span>
              </div>
            </div>

            {/* Card CTA Footer */}
            <div className="history-card-footer">
              <span className="deliverables-count">
                <strong>{wf.itemsProduced}</strong> deliverables ready
              </span>
              <button className="open-canvas-action">
                <span>Open Canvas</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        ))}

        {workflows.length === 0 ? (
          <div className="no-workflows-state" style={{ gridColumn: '1 / -1', padding: '56px 20px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(201, 243, 106, 0.12)', color: '#c9f36a', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
              <Workflow size={24} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#142019', margin: '0 0 6px' }}>No campaigns generated yet</h3>
            <p style={{ fontSize: '13.5px', color: '#7a877d', margin: '0 auto 18px', maxWidth: '420px', lineHeight: 1.5 }}>
              Use the Marketing Bot to generate multi-agent campaigns. Each run dynamically builds a node graph and produces deliverables.
            </p>
            <button
              className="primary-button"
              style={{ margin: '0 auto' }}
              onClick={() => {
                if (onCreateCampaign) onCreateCampaign();
                else onNavigate('marketing');
              }}
            >
              <Plus size={14} /> Create Your First Campaign
            </button>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="no-workflows-state" style={{ gridColumn: '1 / -1', padding: '48px 20px', textAlign: 'center' }}>
            <Workflow size={28} />
            <h3>No matching workflows found</h3>
            <p>Try searching with another keyword or clear filters.</p>
            <button
              className="secondary-button"
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('All');
              }}
            >
              Reset filters
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
export default WorkflowsPage;
