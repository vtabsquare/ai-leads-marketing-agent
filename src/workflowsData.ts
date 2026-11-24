export type NodeCategory = 'trigger' | 'rag' | 'router' | 'agent' | 'guardrail' | 'action';
export type NodeStatus = 'success' | 'running' | 'idle' | 'warning';

export type WorkflowNode = {
  id: string;
  name: string;
  subtitle: string;
  category: NodeCategory;
  status: NodeStatus;
  executionTime: string;
  itemsCount?: string;
  summary: string;
  config: Record<string, string | number | boolean | string[]>;
  inputData: Record<string, any>;
  outputData: Record<string, any>;
  position: { x: number; y: number };
};

export type WorkflowEdge = {
  id: string;
  from: string;
  to: string;
  animated?: boolean;
  label?: string;
};

export type CampaignWorkflow = {
  id: string;
  title: string;
  brief: string;
  knowledgeBase: string;
  status: 'Completed' | 'Running' | 'Active' | 'Draft';
  createdAt: string;
  duration: string;
  itemsProduced: number;
  triggerType: 'Manual Brief' | 'Signal Surge' | 'Scheduled Sprint' | 'CRM Event';
  tags: string[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  outputs: {
    social?: {
      platform: string;
      headline: string;
      body: string;
      tags: string[];
    };
    artDirection?: {
      title: string;
      headline: string;
      caption: string;
      aspectRatio: string;
      palette: string[];
    };
    dm?: {
      recipient: string;
      role: string;
      company: string;
      intent: number;
      body: string;
    };
  };
};

export const defaultCampaignNodes: WorkflowNode[] = [
  {
    id: 'node-trigger',
    name: 'Campaign Brief',
    subtitle: 'Inbound Trigger',
    category: 'trigger',
    status: 'success',
    executionTime: '12ms',
    itemsCount: '1 item',
    summary: 'Received campaign brief targeting platform migration planners.',
    config: {
      initiator: 'Devon Miller (Admin)',
      intentThreshold: 75,
      mode: 'Multi-Agent Collaborative',
      priority: 'High',
    },
    inputData: {
      rawBrief: 'Campaign brief input',
      targetAudience: 'VPs of Operations, IT Directors, Head of RevOps',
      desiredAction: 'Draft LinkedIn post, editorial creative, and 1:1 outreach',
    },
    outputData: {
      normalizedGoal: 'Launch marketing campaign',
      topicCluster: 'demand-generation',
      estimatedReach: 'Qualified prospect accounts',
    },
    position: { x: 40, y: 180 },
  },
  {
    id: 'node-rag',
    name: 'Vtab Knowledge RAG',
    subtitle: 'Semantic Vector Search',
    category: 'rag',
    status: 'success',
    executionTime: '410ms',
    itemsCount: '3 chunks',
    summary: 'Retrieved authoritative chunks from Knowledge Base.',
    config: {
      index: 'Selected Knowledge Base',
      similarityCutoff: 0.82,
      chunkLimit: 3,
      embeddingModel: 'text-embedding-004',
    },
    inputData: {
      query: 'campaign brief context retrieval',
    },
    outputData: {
      matchedChunks: [
        {
          source: 'Knowledge Base · Verified',
          relevance: 0.94,
          excerpt: 'Grounding facts extracted to ensure 0% hallucination.',
        },
      ],
    },
    position: { x: 310, y: 180 },
  },
  {
    id: 'node-router',
    name: 'Agent Coordinator',
    subtitle: 'Parallel Task Fan-Out',
    category: 'router',
    status: 'success',
    executionTime: '24ms',
    itemsCount: '3 tasks',
    summary: 'Dispatched context concurrently to Copywriter, Art Director, and Outreach Strategist.',
    config: {
      orchestration: 'Parallel Fan-Out (Fork)',
      concurrency: 3,
      passKnowledgeContext: true,
    },
    inputData: {
      readyAgents: ['Copywriter', 'Art Director', 'Outreach Strategist'],
      groundingContextSize: '1.2k tokens',
    },
    outputData: {
      agentFanOut: [
        { agent: 'Copywriter', task: 'Thought Leadership Draft' },
        { agent: 'Art Director', task: 'Visual & Creative Specs' },
        { agent: 'Outreach Strategist', task: 'High-Intent 1:1 Matching' },
      ],
    },
    position: { x: 580, y: 180 },
  },
  {
    id: 'node-copywriter',
    name: 'Copywriter Agent',
    subtitle: 'Thought Leadership',
    category: 'agent',
    status: 'success',
    executionTime: '1.42s',
    itemsCount: '1 post',
    summary: 'Drafted LinkedIn thought piece framing problem and clear CTA.',
    config: {
      tone: 'Helpful, Product-Led, No Hype',
      wordCountTarget: 140,
      includeCallToAction: true,
    },
    inputData: {
      coreAngle: 'Clarity before change',
      sourceKeyPoints: ['Verification before launch', 'Checklist establishes clear owner accountability'],
    },
    outputData: {
      headline: 'A clearer path starts before the first step.',
      bodySnippet: 'Our new readiness framework helps your team map risks and align owners.',
      tags: ['#ProductLed', '#RevOps', '#Automation'],
    },
    position: { x: 860, y: 60 },
  },
  {
    id: 'node-art-director',
    name: 'Art Director Agent',
    subtitle: 'Visual Creative Specs',
    category: 'agent',
    status: 'success',
    executionTime: '1.18s',
    itemsCount: '1 concept',
    summary: 'Generated creative layout guidelines: warm editorial type and clean orbit motifs.',
    config: {
      aesthetic: 'Editorial paper minimalism',
      primaryAccent: '#c9f36a (Lime)',
      darkAccent: '#142019 (Deep Ink)',
      gridSystem: '1:1 square & 16:9 banner',
    },
    inputData: {
      theme: 'Clarity simplified',
      copyHeadline: 'A clearer way through.',
    },
    outputData: {
      headline: 'A clearer way through.',
      artSpecs: 'Northstar Field Notes · Two-orbit motif · Editorial typography',
      palette: ['#142019', '#c9f36a', '#ffffff'],
    },
    position: { x: 860, y: 180 },
  },
  {
    id: 'node-outreach',
    name: 'Outreach Strategist',
    subtitle: 'Prospect 1:1 Matching',
    category: 'agent',
    status: 'success',
    executionTime: '980ms',
    itemsCount: '1 match',
    summary: 'Generated tailored 1:1 outreach based on buyer intent signal.',
    config: {
      personalizationDepth: 'High',
    },
    inputData: {
      contextSignal: 'Evaluating tools and workflows.',
    },
    outputData: {
      recipient: 'Target Lead',
      draftMessage: 'Personalized message connecting pain points directly to solution.',
    },
    position: { x: 860, y: 300 },
  },
  {
    id: 'node-guardrail',
    name: 'Human Review Gate',
    subtitle: 'Policy & Guardrail Gate',
    category: 'guardrail',
    status: 'success',
    executionTime: 'Approved',
    itemsCount: '3 drafts',
    summary: 'All outputs verified against grounded facts; queued for final approval.',
    config: {
      requireApproval: true,
      minIntentThreshold: 75,
      hallucinationCheck: 'Passed (0 ungrounded claims)',
      brandSafety: '100% compliant',
    },
    inputData: {
      draftsPending: 3,
      maxIntent: 94,
    },
    outputData: {
      gateStatus: 'Approved for outbound queue',
      reviewer: 'Devon Miller',
    },
    position: { x: 1140, y: 180 },
  },
  {
    id: 'node-dispatch',
    name: 'Omnichannel Dispatch',
    subtitle: 'CRM Sync & Distribution',
    category: 'action',
    status: 'success',
    executionTime: '85ms',
    itemsCount: '3 synced',
    summary: 'Buffered drafts to Review Queue, CRM sync, and Slack notifications.',
    config: {
      channels: ['LinkedIn Draft', 'Direct Outreach Queue', 'Slack Alert'],
      crmSync: 'Salesforce Lead Status: Engaged',
    },
    inputData: {
      approvedItems: ['Social Post', 'Art Direction', 'Personalized DM'],
    },
    outputData: {
      deliveryStatus: 'Queued to send',
      slackNotified: true,
      auditLogId: 'AUD-VTAB-LIVE',
    },
    position: { x: 1410, y: 180 },
  },
];

export const defaultCampaignEdges: WorkflowEdge[] = [
  { id: 'e1', from: 'node-trigger', to: 'node-rag' },
  { id: 'e2', from: 'node-rag', to: 'node-router' },
  { id: 'e3', from: 'node-router', to: 'node-copywriter' },
  { id: 'e4', from: 'node-router', to: 'node-art-director' },
  { id: 'e5', from: 'node-router', to: 'node-outreach' },
  { id: 'e6', from: 'node-copywriter', to: 'node-guardrail' },
  { id: 'e7', from: 'node-art-director', to: 'node-guardrail' },
  { id: 'e8', from: 'node-outreach', to: 'node-guardrail' },
  { id: 'e9', from: 'node-guardrail', to: 'node-dispatch' },
];

// Clean initial workflows: zero mock data
export const initialWorkflows: CampaignWorkflow[] = [];
