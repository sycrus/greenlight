# Pre-Build Clarifying Questions

Answer each question inline after the `>` block. Questions are grouped by theme.

---

## 1. Scope and Phasing

**1.1** There is no phased delivery plan in the PRD. What does the MVP look like — what is the minimum that needs to work end-to-end before anything else? For example: "one conversation, one component rendered, brand rules applied" before memory and distillation are built out?

>  frontend in React, A2UI , AG UI, Parlant, Langgraph with an orchestrator agent, and 2 agents, one retrieving weather API as an example. Use Shadcn for starters. Use placeholders for memory, ie don't build it out but put comments where the memory will be. Set up the file structures properly to split up all the components. For Parlant, just put some basic conditions that lead to the 2 agents either working alone or together. For logging, OTel but we don't have Langsmith set up yet, can you just debug to console?

**1.2** What is the team composition? How many engineers, and is there a frontend/backend split or are people full-stack? This affects how work gets sequenced.

> 2 engineers, 1 frontend 1 backend, so one will take A2UI, AG UI and Parlant. The other will handle the rest.

---

## 2. Frontend

**2.1** The PRD mentions React components and Storybook but never names the app framework. Is the frontend Next.js, Vite/React, or something else?

> Next.js

**2.2** Is the design system (Storybook components, DTCG tokens) pre-existing or does it need to be built as part of this project? If it exists, where does it live?

> it will be built in but use Shadcn for now. make it so that it's easier to swap out

**2.3** Who owns the frontend repo — same team or a separate one?

> assume same team

---

## 3. Streaming / Parlant + AG-UI Architecture

**3.1** The architecture shows `User → Parlant → LangGraph → AG-UI → Frontend`. But AG-UI streams events directly to the frontend. Does Parlant sit in the streaming path, or does it hand off to LangGraph and then LangGraph streams independently? This needs to be pinned — it is a core wiring decision.

> is parlant supposed to route agents, act as an orchestrator? or impose guardrails? my assumption is that it hands off to Langgraph, ie routing agent and customer service/concierge

**3.2** How exactly does Parlant call LangGraph "as a tool"? Does LangGraph expose an HTTP endpoint that Parlant hits, or is this an in-process call? The integration contract between these two is underspecified.

>  I'm not sure. what will be the way to build this out for maximum flexibility?

---

## 4. Open Decisions Blocking Implementation

**4.1** **Parlant hosting** — self-hosted is recommended in the PRD but still listed as open. This needs to be resolved before dev environment setup.

>  Can i host it on GCP? what resources do i need to create? Cloud Functions?

**4.2** **Mem0 vs bespoke adapters** — this changes the memory implementation significantly. What is the appetite for taking the Mem0 dependency vs. building bespoke adapters behind the `MemoryStore` interface?

> use mem0. how trivial is it to write bespoke adapters after? can i have an adapter now that uses mem0?

**4.3** **Forgetting / retention policy** — has legal or compliance been consulted yet? TTLs and GDPR cascade specifics need to be defined before the memory schema is built.

> can we hold off on this for now. probably a phase 2 thing once the core spine is built out

**4.4** **Compliance frameworks** — which ones are in scope (SOC 2, ISO 27001, GDPR, CCPA)? This determines what controls need to be built vs. documented.

> hold off on compliance for now

---

## 5. Content and Data Readiness

**5.1** Is the Contentful dev space already set up, and is any brand content populated — even sample `BrandRule` and `TerminologyEntry` entries? The Parlant sync job and MCP server have nothing to test against without this.

> not set up yet. can you set up placeholders? but expect contentful

**5.2** What documents are being indexed by LlamaIndex? Brand guidelines from Contentful, PDFs, something else? What is the retrieval use case?

> hold off on these

---

## 6. Technical Specifics

**6.1** Which Claude model is the default for agent turns? And is a separate (cheaper) model intended for the distillation LLM-as-judge, or is it the same model?

> for now let's set to the cheapest, haiku? make it easy to change or set based on agent type

**6.2** The MCP server uses HTTP/SSE transport — which MCP SDK, Python or TypeScript? This should match the primary backend language.

> hold off on MCP for now, phase 2

**6.3** What is the primary backend language? The PRD does not state Python vs. TypeScript explicitly, though LangGraph and LlamaIndex both have Python as the primary SDK path.

> use typescript

**6.4** For TDD — what test frameworks are in scope? (e.g. pytest + pytest-asyncio for the Python backend, Jest/Vitest for the frontend?)

> ok that works, what alternatives for TS backend? playwright mcp? or what else

---

## 7. SKILL.md

**7.1** Section 12 lists four SKILL.md files to create, but the format is not defined anywhere. What is a SKILL.md — a structured prompt file, a markdown spec, something machine-readable? It is referenced as a "durable asset" but its schema is not specified in the PRD.

> should we reference SKILL.md from Claude's database for this?
