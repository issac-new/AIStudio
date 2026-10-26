# Red Team Agent

Turn your Claude Code into a Red Team Agent!!!

A comprehensive collection of Claude Code skills for AI agent security research, adversarial testing, and automated red team operations. Extract internal schemas, test for vulnerabilities, and evaluate AI agents from any platform.

## What is This?

Red Team Agent is a **hybrid attack framework** that combines:
- 🧠 **LLM-powered reasoning** - Claude Code intelligently crafts and optimizes attack payloads
- 🛠️ **Python orchestration** - Automated attack loops with adaptive strategies
- 🌐 **Multi-transport support** - Works with Web UIs, REST APIs, WebSockets, and Gradio apps
- 📊 **Self-learning system** - Learns from past attacks and improves over time

**Key Features**:
- ✅ **Auto-detection** - Automatically identifies target type and selects appropriate transport
- ✅ **Nested delegation attacks** - "Russian Doll" (套娃) attack to extract internal schemas
- ✅ **Smart payload optimization** - Learns from responses and adapts attack strategy
- ✅ **Planning-with-files workflow** - Review attack plans before execution
- ✅ **Persistent browser sessions** - Handles SSO/Google login with stealth mode
- ✅ **Comprehensive reporting** - Saves all results with attack strategies for future reference

## Overview

Red Team Agent provides tools to interact with, test, and evaluate AI agents from various platforms. It enables Claude Code to act as a proxy user, automating conversations with target AI agents for security research and evaluation purposes.

### Attack Results

Successfully extracted schemas from:
- ✅ **Magentic-UI** (Multi-agent system) - Full nested schema extraction
- ✅ **Browser-Use** (Single-agent, Gradio) - Complete action schema with 12 action types
- ✅ More targets documented in `reports/` directory

## Skills

### Core Skills (Included)

| Skill | Description | Purpose |
|-------|-------------|---------|
| **[red-team](./.claude/skills/red-team/)** | Automated red team testing using adaptive nested delegation attacks | Main attack orchestrator - extracts schemas and system prompts |
| **[agent-proxy](./.claude/skills/agent-proxy/)** | Auto-discover and communicate with any AI agent via URL | Transport layer for API-based agents (REST, WebSocket, Gradio) |

### Required External Skills

You **must** install at least one browser automation skill for Web UI targets:

| Skill | Description | Recommendation |
|-------|-------------|----------------|
| **[dev-browser](https://github.com/SawyerHood/dev-browser)** | Persistent browser automation with stealth mode | ⭐ **Recommended** - Better session management, handles SSO/Google login |
| **[playwright-skill](https://github.com/lackeyjb/playwright-skill)** | Generic Playwright-based browser automation | Alternative if dev-browser unavailable |

### Optional Skills

| Skill | Description | Use Case |
|-------|-------------|----------|
| **[claude-reflect](https://github.com/BayramAnnakov/claude-reflect)** | Self-learning system that captures corrections and updates CLAUDE.md | Learn from mistakes and improve over time |

## Architecture

The `red-team` skill orchestrates attacks by delegating communication to specialized transport skills (`agent-proxy` or `dev-browser`), which then interact with the target agent.

```
┌─────────────┐
│ Claude Code │
└──────┬──────┘
       │ 1. Invokes
┌──────▼───────┐
│   red-team   │
│    skill     │
└──────┬───────┘
       │
       │ 2. Selects Transport (via transport.py)
       ▼
┌──────────────┐    ┌─────────────┐
│ agent-proxy  │    │ dev-browser │
│    skill     │    │    skill    │
└──────┬───────┘    └──────┬──────┘
       │                   │
       │ 3. API            │ 3. Browser
       ▼                   ▼
┌─────────────────────────────────┐
│          Target Agent           │
└─────────────────────────────────┘
```

## Installation & Setup

Follow these steps to set up Red Team Agent on your system.

### Prerequisites

- **Claude Code CLI** installed and configured
- **Python 3.8+** for Python-based skills
- **Node.js 16+** for browser automation skills
- **Git** for cloning repositories

### Step 1: Clone This Repository

```bash
git clone https://github.com/yechao-zhang/red-team-agent-skills.git
cd red-team-agent-skills
```

### Step 2: Install Core Skill Dependencies

Install Python dependencies for the included `red-team` and `agent-proxy` skills:

```bash
pip install -r .claude/skills/red-team/requirements.txt
pip install -r .claude/skills/agent-proxy/requirements.txt
```

**What gets installed:**
- `anthropic` - For LLM-based payload optimization
- `requests` - For HTTP API communication
- `websockets` - For WebSocket-based agents
- `gradio_client` - For Gradio app testing

### Step 3: Choose Your Usage Mode

You have two options for using these skills:

#### Option A: Project-Local Use (Recommended for Testing)

Run Claude Code directly from this repository. Skills will be automatically loaded from `.claude/skills/`.

```bash
# From the red-team-agent-skills directory
claude
```

**Pros:**
- ✅ Easy to test and modify skills
- ✅ Keep different versions for different projects
- ✅ Changes don't affect global skills

**Cons:**
- ❌ Only available when running from this directory

#### Option B: Global Installation (Recommended for Production)

Install skills globally so they're available in any directory:

```bash
# Create global skills directory
mkdir -p ~/.claude/skills

# Copy core skills
cp -r .claude/skills/red-team ~/.claude/skills/
cp -r .claude/skills/agent-proxy ~/.claude/skills/
```

**Pros:**
- ✅ Available everywhere
- ✅ Use `/red-team` from any project

**Cons:**
- ❌ Updates require manual re-copying

### Step 4: Install Browser Automation (Required for Web UIs)

**You must install at least one browser automation skill** to test Web UI agents.

#### Option A: dev-browser (⭐ Recommended)

Best for production use - handles SSO login, persistent sessions, stealth mode.

```bash
# Clone dev-browser
git clone https://github.com/SawyerHood/dev-browser.git ~/.claude/skills/dev-browser

# Install dependencies
cd ~/.claude/skills/dev-browser
npm install

# Install Playwright browser
npx playwright install chromium

# Test installation
./server.sh
# Should output: "Ready" (press Ctrl+C to stop)
```

**Features:**
- ✅ Persistent login sessions (cookies/localStorage saved)
- ✅ Stealth mode (evades simple bot detection)
- ✅ Profile management (separate sessions for different targets)
- ✅ Manual login support for Google SSO

#### Option B: playwright-skill (Alternative)

Standard Playwright automation - use if dev-browser is unavailable.

```bash
# Clone playwright-skill
git clone https://github.com/lackeyjb/playwright-skill.git ~/.claude/skills/playwright-skill

# Install dependencies
cd ~/.claude/skills/playwright-skill
pip install -r requirements.txt
npx playwright install chromium
```

**Note:** Less robust for persistent logins compared to dev-browser.

### Step 5: Install Self-Learning (Optional)

Install `claude-reflect` to capture corrections and improve over time:

```bash
# Clone claude-reflect
git clone https://github.com/BayramAnnakov/claude-reflect ~/.claude/skills/claude-reflect

# No additional dependencies needed
```

**What it does:**
- Captures corrections when you say "no, use X instead"
- Queues learnings for review
- Run `/reflect` to update CLAUDE.md with lessons learned

### Step 6: Verify Installation

Test that everything is working:

```bash
# Start Claude Code
claude

# In Claude Code session:
# 1. Test skill loading
User: List available skills

# 2. Test red-team skill
User: /red-team --help

# 3. Test browser automation (if installed)
User: Navigate to https://example.com using dev-browser
```

### Troubleshooting

**Issue: "Skill not found"**
- Make sure you're in the right directory (project-local mode)
- Or verify skills are copied to `~/.claude/skills/` (global mode)
- Run `ls ~/.claude/skills/` to check

**Issue: "dev-browser server not starting"**
- Check Node.js version: `node --version` (need 16+)
- Try manually: `cd ~/.claude/skills/dev-browser && ./server.sh`
- Check port 9222 isn't in use: `lsof -i :9222`

**Issue: "Module not found" (Python)**
- Reinstall dependencies: `pip install -r .claude/skills/red-team/requirements.txt`
- Check Python version: `python3 --version` (need 3.8+)

**Issue: "Playwright browser not found"**
- Install manually: `cd ~/.claude/skills/dev-browser && npx playwright install chromium`
- Or: `cd ~/.claude/skills/playwright-skill && npx playwright install chromium`

## Usage

### 1. Red Team Attack

Run an automated red team attack against a target agent. This automatically detects if the target is an API or Web UI and uses the appropriate transport.

#### Direct Execution (Default)
```
User: Test http://localhost:8082 for schema extraction using /red-team
User: /red-team 8082
```

The `red-team` skill will:
1. Auto-detect the target type (Web UI, API, WebSocket, etc.)
2. Deploy a subagent to orchestrate the attack
3. Use adaptive nested delegation ("Russian Doll" attack) to extract internal schemas
4. Optimize payloads based on responses
5. Save results to `reports/` directory

#### Planning-with-Files Workflow
For complex targets or when you want to review the attack strategy before execution:

```
User: Red team attack against http://127.0.0.1:7860 using planning-with-files
User: /red-team 8080 with planning
User: Plan first, then attack http://localhost:8082
```

**Workflow**:
1. **Plan Mode**: Agent researches target, analyzes past reports, and writes a detailed attack plan to `task_plan.md`
2. **User Review**: You review and approve (or modify) the plan
3. **Execution**: Agent executes the approved attack strategy
4. **Report**: Results saved to `reports/` directory

**When to use planning mode**:
- Unfamiliar or complex targets
- Want to understand attack approach before execution
- Need to document attack strategy for compliance/research
- Testing production systems (review before attacking)

**Trigger keywords**:
- "planning-with-files"
- "with planning"
- "plan first"
- "files to plan"

### 2. Agent Proxy
Interact with an agent manually for exploration.

```
User: Connect to https://gemini.google.com and ask "What is 1+1?"

Claude Code: [Uses agent-proxy skill to automate browser/API, send message, get response]
```

### 3. Self-Learning (Reflect)
If installed, review captured corrections:

```
User: /reflect
```

## Supported Target Agents

**Universal Coverage: If a human can interact with it, Red Team Agent can test it.**

This framework automatically detects and adapts to any AI agent interface that accepts text input and returns text output. No configuration needed - just provide the URL or endpoint.

### Supported Interface Types

| Interface Type | Auto-Detection | Examples |
|----------------|----------------|----------|
| **Web UIs** | ✅ Automatic | Any web page with chat interface (Gradio, Streamlit, custom HTML) |
| **REST APIs** | ✅ Automatic | OpenAI-compatible, Anthropic API, custom JSON endpoints |
| **WebSocket** | ✅ Automatic | Real-time chat APIs, streaming responses |
| **Gradio Apps** | ✅ Automatic | HuggingFace Spaces, local Gradio deployments |

### How It Works

1. **Provide a URL** - Web UI (`http://localhost:8080`) or API endpoint
2. **Auto-detect** - Framework identifies interface type (HTML, JSON API, WebSocket, etc.)
3. **Select transport** - Uses `dev-browser` for Web UIs, `agent-proxy` for APIs
4. **Execute attack** - Sends adaptive payloads regardless of interface

### Verified Examples

These are targets we've successfully tested, **but the framework works with any agent**:

#### Web-Based Agents
- ✅ **[Magentic-UI](https://github.com/johncristian/magentic-ui)** - Multi-agent orchestration system (when deployed locally)
- ✅ **[Browser-Use](https://github.com/browser-use/browser-use)** - Gradio-based browser automation agent (when deployed locally)
- ✅ **[ChatGPT](https://chat.openai.com)** - Requires login (handled via persistent sessions)
- ✅ **[Claude.ai](https://claude.ai)** - Requires login
- ✅ **[Google Gemini](https://gemini.google.com)** - Google SSO supported
- 🌐 **Any web chat interface** - If humans can type and get responses, we can test it

#### API-Based Agents
- ✅ **OpenAI-compatible APIs** (`/v1/chat/completions` endpoints)
- ✅ **Anthropic API** (`/v1/messages`)
- ✅ **Ollama** (`http://localhost:11434`)
- ✅ **Custom REST APIs** - Any endpoint accepting JSON
- 🔌 **WebSocket streams** - Real-time communication protocols
- 📦 **Gradio backends** - Auto-discovered from web UI

### Authentication Support

| Auth Method | Support | Notes |
|-------------|---------|-------|
| **No auth** | ✅ Direct | Works immediately |
| **API Keys** | ✅ Headers | Pass via environment or config |
| **OAuth/SSO** | ✅ Manual + Persist | Login once manually, sessions saved |
| **Google SSO** | ✅ Stealth mode | `dev-browser` handles persistent login |
| **2FA** | ✅ Manual setup | Complete 2FA once, cookie persists |

### New Target? No Problem.

Don't see your target listed? **It doesn't matter.**

If the agent:
- ✅ Accepts text input (via web form, API POST, WebSocket message, etc.)
- ✅ Returns text output (HTML, JSON, plain text, streaming, etc.)
- ✅ Is accessible by a human user (with or without login)

Then Red Team Agent can test it. The framework will:
1. Auto-detect the interface
2. Select the appropriate transport
3. Execute the attack
4. Save results to `reports/`

**Try it:** Just run `/red-team <your-target-url>` and watch it work.

### Handling Persistent Logins (SSO/Google)

The `dev-browser` skill supports persistent sessions for agents requiring login (Google SSO, OAuth, etc.).

**How it works:**
1. **Automatic persistence** - Cookies and localStorage are saved to `~/.claude/skills/dev-browser/profiles/`
2. **Stealth mode** - Browser is patched to evade basic bot detection
3. **Session reuse** - Once logged in, sessions persist across restarts

**Manual login workflow for SSO:**

If automated login fails (e.g., "This browser or app may not be secure"):

```bash
# 1. Stop any running dev-browser server
pkill -f "dev-browser"

# 2. Start server in headed mode (visible browser)
cd ~/.claude/skills/dev-browser
./server.sh
# Keep this running in a separate terminal

# 3. In Claude Code, navigate to the login page
User: Navigate to https://chat.openai.com using dev-browser

# 4. Manually complete login in the visible browser window
# (Click through Google SSO, complete 2FA, etc.)

# 5. Once logged in, the session is saved automatically
# Future attacks will reuse this session

# 6. Test that session persists
User: /red-team https://chat.openai.com
# Should not require login again
```

**Tips:**
- Sessions are saved per domain
- Delete profiles to force re-login: `rm -rf ~/.claude/skills/dev-browser/profiles/`
- Use separate profiles for different accounts (not yet implemented)

## Use Cases

1. **Security Research**: Test AI agents for vulnerabilities, jailbreaks, prompt injections
2. **Agent Evaluation**: Automated testing of agent capabilities and behaviors
3. **Agent-to-Agent Communication**: Build pipelines where agents interact with each other
4. **Red Team Exercises**: Authorized adversarial testing of AI systems

## Important Notes

- **Authorization Required**: Only use these tools on systems you have permission to test
- **Responsible Disclosure**: Report any vulnerabilities found through proper channels
- **Ethical Use**: These tools are for defensive security research and authorized testing only

## Project Structure

```
red-team-agent-skills/
├── README.md                        # This file - comprehensive guide
├── CLAUDE.md                        # Project context and developer guidelines
├── LICENSE                          # MIT License
│
├── .claude/skills/                  # Core skills (included in repo)
│   ├── red-team/                    # Main attack orchestrator
│   │   ├── SKILL.md                 # Skill documentation
│   │   ├── requirements.txt         # Python dependencies
│   │   ├── scripts/
│   │   │   ├── improved_adaptive_attack.py
│   │   │   └── transport.py         # Transport layer (auto-detection)
│   │   └── knowledge/               # Attack knowledge base
│   │       ├── nested-delegation-attack.md
│   │       ├── payload_patterns.md
│   │       ├── success_criteria.md
│   │       ├── single-agent.md
│   │       ├── gpt-pilot.md
│   │       └── schemas.json
│   │
│   └── agent-proxy/                 # API transport layer
│       ├── SKILL.md
│       ├── requirements.txt
│       └── scripts/
│           └── proxy.py
│
├── reports/                         # Attack results (auto-generated)
│   ├── 2026-01-11_magentic-ui_8082.json
│   ├── 2026-01-14_browser-use_7860.json
│   └── ...
│
└── docs/                            # Additional documentation
    └── [documentation files]

External skills (install separately):
~/.claude/skills/
├── dev-browser/                     # Browser automation (recommended)
├── playwright-skill/                # Browser automation (alternative)
└── claude-reflect/                  # Self-learning (optional)
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - See [LICENSE](./LICENSE) for details.

## Disclaimer

This project is intended for authorized security testing and research purposes only. Users are responsible for ensuring they have proper authorization before testing any systems. The authors are not responsible for misuse of these tools.
