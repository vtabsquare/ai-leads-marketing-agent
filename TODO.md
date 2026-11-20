# TODO

## Executive dashboard and approval queue — complete
- The main executive screen tracks overall sales pipeline metrics, charts lead growth, monitors which AI bots are currently running, and shows pending outreach items waiting for approval.
- Provide functional review states for pending outreach, including approve and dismiss/reject actions, and surface bot status in the overview.
- Evidence: overview includes four KPIs, a switchable 30D/90D/12M lead chart, three agent states, a knowledge index summary, and an approval queue whose approve/dismiss actions update the queue.

## Lead Bot prospect discovery — open: live discovery connector needed
- The Lead Bot finds prospective clients for a prompt (e.g., “find people looking for migration tools”), searches social media and public forums for matching people, captures contact info, extracts what they need, and scores likelihood to buy.
- Show lead profiles with captured contact details, expressed needs, source context, and an intent/likelihood-to-buy score; allow the prompt workflow to be exercised interactively.
- Evidence: the prompt, example briefs, sample prospect records, source/context, intent scores and a timed sample-search result are implemented. Real external social/public-forum search and contact extraction are not connected.

## Sources and Knowledge Base — open: live document ingestion/indexing needed
- Sources & Knowledge Base is where the user teaches the AI about their company and products.
- Allow website URL scanning or PDF upload, and represent imported material as searchable chunks (RAG) so bots can reference accurate facts.
- Evidence: URL and PDF inputs, processing states, searchable sample chunks and RAG controls are implemented in the interactive interface. Actual page crawling, PDF parsing, durable indexing and backend RAG retrieval are not connected.

## Marketing Bot campaign workspace — open: live generation/service integration needed
- The Marketing Bot creates marketing campaigns. The user chooses which knowledge base to use, and multiple AI bots work together to write ready-to-publish social media posts, design visual graphics, and draft personalized direct messages for leads found by the Lead Bot.
- Provide an interactive content-generation workspace with campaign-ready drafts and distinct outputs for social posts, graphics, and personalized DMs.
- Evidence: editable brief, knowledge-base selector, three agent roles, generation state, social/visual/DM output tabs and approval actions are implemented. Draft content and the visual art-direction card are sample content; AI generation and image-creation services are not connected.

## Settings and integrations — open: external credentials/services needed
- Settings let the user set how high a lead's intent score must be before alerting them, turn human approval requirements on/off, manage RAG settings, and connect CRM tools such as Salesforce or Slack.
- Controls must respond to interaction and visibly reflect their current settings and integration status.
- Evidence: threshold slider, approval toggle, chunk-size control, citation and refresh toggles, and Salesforce/Slack connected-state switches work in the session. Durable preferences and real CRM/Slack authorization or sync are not connected.

## Premium visual system and interactions — complete
- Build a very modern premium website with interactive design and animations, very minimal, and avoid generic, messy AI output.
- Use consistent navigation, deliberate typography and spacing, responsive layouts, and restrained purposeful motion across the product workspace.
- Evidence: cohesive Signal identity and palette, responsive sidebar/topbar and page layouts, animated transitions, keyboard command menu, interactive filters/toggles/dialogs, and reduced-motion handling are implemented.
