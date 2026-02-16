# How to Use Friday CLI

Friday CLI is an autonomous AI agent for the terminal. It connects to multiple AI providers (OpenAI, Google, ElevenLabs) and gives you a single conversational interface to generate text, images, videos, voice, and more — all from your terminal.

Friday runs a local runtime with MCP (Model Context Protocol) servers that provide the agent with tools for file management, terminal commands, media generation, and third-party integrations via plugins.

## Installation

```bash
npm install -g @tryfridayai/cli
```

## Quick Start

```bash
friday chat
```

On first run, Friday will launch the setup wizard to configure your API keys.

## Top-Level Commands

| Command | Description |
|---------|-------------|
| `friday chat` | Start an interactive chat session (default) |
| `friday chat --workspace <path>` | Chat with a specific workspace directory |
| `friday chat --verbose` | Chat with debug output enabled |
| `friday serve` | Start an HTTP/WebSocket server |
| `friday serve --port <port>` | Start server on a specific port (default: 8787) |
| `friday setup` | Run the guided onboarding wizard |
| `friday install <plugin>` | Install a specific plugin |
| `friday uninstall <plugin>` | Remove a plugin |
| `friday plugins` | List installed and available plugins |
| `friday schedule` | Manage scheduled agents |

---

# Chat Interface

The chat interface is where you interact with Friday. It features a bottom-pinned input bar separated from output by a horizontal line. Agent output scrolls above, while your input prompt stays fixed at the bottom.

## Input Features

- **Multi-line paste**: Paste multiple lines and they are joined into a single message
- **Command history**: Press Up/Down arrows to cycle through your last 50 commands
- **Cursor editing**: Left/Right arrows, Home/End, Ctrl+A/E/U/K/W, Delete, Backspace
- **Ctrl+C**: Clears current input if non-empty; exits if input is empty

---

# Slash Commands

All slash commands are available inside `friday chat`.

## /help

Show all available commands and their aliases.

**Aliases:** `/h`

```
f > /help
```

## /status

Display session info, workspace path, permission profile, verbose mode, capability badges, installed plugin count, and scheduled agent count.

**Aliases:** `/s`

```
f > /status
```

## /model

Interactive model browser. Browse models by category (Chat, Image, Video, Voice, STT), see pricing, enabled/disabled status, and toggle individual models on or off.

**Aliases:** `/m`, `/models`

```
f > /model
```

Use arrow keys to select a category, then toggle models within that category.

## /keys

Add or update API keys for AI providers. Keys are stored securely in the system keychain (macOS Keychain, Windows Credential Manager, Linux libsecret).

**Aliases:** `/k`

```
f > /keys
```

Shows configured status for each provider and lets you add or update keys. Supported providers:

| Provider | Environment Variable | Unlocks |
|----------|---------------------|---------|
| Anthropic | `ANTHROPIC_API_KEY` | Chat (Claude) |
| OpenAI | `OPENAI_API_KEY` | Chat, Images, Voice, Video |
| Google AI | `GOOGLE_API_KEY` | Chat, Images, Voice, Video |
| ElevenLabs | `ELEVENLABS_API_KEY` | Premium Voice |

## /plugins

Install, uninstall, or view plugins that extend Friday with third-party integrations.

**Aliases:** `/p`

```
f > /plugins
```

Options:
- **View installed** — See all plugins and their status
- **Install a plugin** — Pick from available plugins and enter credentials
- **Uninstall a plugin** — Remove a plugin

## /config

Change the permission profile or workspace path.

```
f > /config
```

### Permission Profiles

| Profile | File Reads | File Writes | Terminal | Description |
|---------|-----------|-------------|----------|-------------|
| **developer** (default) | Auto-approve | Auto-approve in workspace | Asks each time | For active development |
| **safe** | Auto-approve | Denied by default | Asks each time | Read-only exploration |
| **locked** | Asks each time | Asks each time | Asks each time | Maximum control |

## /schedule

Create, view, trigger, or delete scheduled agents. Agents run on a cron schedule and execute tasks automatically.

```
f > /schedule
```

Describe what you want in natural language:

```
> check my emails every morning at 9am
> summarize my GitHub notifications every Friday at 5pm
```

Friday parses natural language into a cron schedule.

## /new

Start a fresh chat session, clearing conversation history.

**Aliases:** `/n`

```
f > /new
```

## /image

Quick image generation shortcut. Sends your prompt directly to the image generation model.

**Aliases:** `/img`

```
f > /image a sunset over mountains in watercolor style
```

## /voice

Quick text-to-speech shortcut. Converts your text to speech using the configured TTS model.

**Aliases:** `/v`

```
f > /voice Hello, welcome to Friday
```

## /clear

Clear the terminal screen.

```
f > /clear
```

## /verbose

Toggle debug output on or off. When enabled, shows raw JSON messages, session IDs, tool inputs, and tool results from the runtime.

```
f > /verbose
```

## /quit

Exit the chat session.

**Aliases:** `/q`

```
f > /quit
```

---

# Permissions

When Friday's agent wants to perform an action (run a command, write a file, generate media), a permission prompt appears:

```
Permission needed: Run Terminal Command
  command: npm install express

❯ Allow
  Allow for this session
  Deny
```

Use arrow keys to select and Enter to confirm. Permissions are queued — if multiple arrive at once, they are shown one at a time.

You can also use legacy colon commands: `:allow`, `:deny`.

---

# AI Models

Friday supports models from three providers. Use `/model` to browse and toggle models, or `/keys` to configure provider API keys.

---

## Chat Models

### GPT-5.2

OpenAI's flagship model with 256K context window and 16K max output tokens. Supports vision, function calling, and structured output.

**Provider:** OpenAI
**Capability:** Chat
**Pricing:** $1.75 in / $14.00 out per 1M tokens ($0.175 cached input)
**Context Window:** 256,000 tokens

Best for general-purpose tasks, coding, analysis, and creative writing.

### GPT-5.2 Codex

Code-optimized variant of GPT-5.2. Same capabilities but tuned for programming tasks.

**Provider:** OpenAI
**Capability:** Chat
**Pricing:** $1.75 in / $14.00 out per 1M tokens ($0.175 cached input)
**Context Window:** 256,000 tokens

Best for code generation, debugging, refactoring, and technical tasks.

### GPT-5.2 Pro

Deep reasoning model optimized for complex problem-solving. Higher output limit of 32K tokens.

**Provider:** OpenAI
**Capability:** Chat
**Pricing:** $15.00 in / $60.00 out per 1M tokens ($7.50 cached input)
**Max Output:** 32,000 tokens

Best for complex reasoning, math, research, and multi-step problem-solving.

### Gemini 3 Pro

Google's reasoning-first model with an industry-leading 1M token context window and 65K max output.

**Provider:** Google
**Capability:** Chat
**Pricing:** $2.00 in / $12.00 out per 1M tokens (up to 200K context), $4.00 in / $18.00 out for larger contexts
**Context Window:** 1,000,000 tokens

Best for processing large documents, long conversations, and complex reasoning.

### Gemini 3 Flash

Fast, lightweight Google model with strong reasoning at lower cost.

**Provider:** Google
**Capability:** Chat
**Pricing:** $0.50 in / $3.00 out per 1M tokens
**Context Window:** 1,000,000 tokens

Best for quick tasks, real-time applications, and cost-effective processing.

---

## Image Models

### GPT Image 1.5

OpenAI's latest image generation model. 4x faster than previous versions with high quality output.

**Provider:** OpenAI
**Capability:** Image Generation
**Pricing:** $0.009 - $0.133 per image (varies by size and quality)

Supports multiple sizes: 1024x1024, 1024x1536, 1536x1024, and more. Quality tiers: low, medium, high.

### GPT Image 1

OpenAI's high quality image generation model.

**Provider:** OpenAI
**Capability:** Image Generation
**Pricing:** $0.011 - $0.167 per image (varies by size and quality)

### GPT Image 1 Mini

Cost-effective image generation for rapid iteration.

**Provider:** OpenAI
**Capability:** Image Generation
**Pricing:** $0.005 - $0.036 per image

Best for drafts, thumbnails, and high-volume generation.

### Imagen 4

Google's balanced image generation model. Good quality with reasonable speed.

**Provider:** Google
**Capability:** Image Generation
**Pricing:** $0.04 per image

### Imagen 4 Ultra

Google's highest fidelity photorealistic image model.

**Provider:** Google
**Capability:** Image Generation
**Pricing:** $0.06 per image

Best for production-quality images where detail matters.

### Imagen 4 Fast

Google's quick iteration image model for rapid prototyping.

**Provider:** Google
**Capability:** Image Generation
**Pricing:** $0.02 per image

---

## Video Models

### Sora 2

OpenAI's fast, flexible video generation model.

**Provider:** OpenAI
**Capability:** Video Generation
**Pricing:** $0.10 per second

Supports durations of 4, 8, or 12 seconds.

### Sora 2 Pro

Higher fidelity video generation from OpenAI with multiple resolution tiers.

**Provider:** OpenAI
**Capability:** Video Generation
**Pricing:** $0.30/sec standard, $0.50/sec high-res (1024p/1792p)

### Veo 3.1

Google's flagship video model with native audio generation, 4K resolution support, and up to 60-second duration.

**Provider:** Google
**Capability:** Video Generation
**Pricing:** $0.40/sec (720p-1080p), $0.60/sec (4K)

Best for high-quality video content with integrated audio.

### Veo 3.1 Fast

Lower-latency variant of Veo 3.1 for quicker iteration.

**Provider:** Google
**Capability:** Video Generation
**Pricing:** $0.15/sec (720p-1080p), $0.35/sec (4K)

### Veo 3

Google's generally available video generation model.

**Provider:** Google
**Capability:** Video Generation
**Pricing:** $0.40/sec standard, $0.15/sec fast

---

## Voice Models (Text-to-Speech)

### GPT-4o Mini TTS

OpenAI's steerable TTS model that follows natural language instructions for tone, style, and emotion.

**Provider:** OpenAI
**Capability:** Text-to-Speech
**Pricing:** $0.015 per minute
**Voices:** 10 built-in voices
**Features:** Streaming, instruction support, emotional control

Example: "Speak in a warm, friendly tone with a slight British accent."

### TTS-1 HD

OpenAI's high-definition text-to-speech model.

**Provider:** OpenAI
**Capability:** Text-to-Speech
**Pricing:** $30.00 per 1M characters

### TTS-1

OpenAI's standard TTS model optimized for low latency.

**Provider:** OpenAI
**Capability:** Text-to-Speech
**Pricing:** $15.00 per 1M characters

### Google TTS

Google Cloud Text-to-Speech with 220+ voices across 40+ languages. Multiple voice quality tiers.

**Provider:** Google
**Capability:** Text-to-Speech
**Pricing:**
- Standard: $4.00 per 1M characters
- WaveNet: $16.00 per 1M characters
- Neural2: $16.00 per 1M characters
- Journey: $30.00 per 1M characters

Supports SSML markup for fine-grained speech control.

### ElevenLabs v3

ElevenLabs' most expressive voice model with emotions, sound effects, and natural range.

**Provider:** ElevenLabs
**Capability:** Text-to-Speech
**Pricing:** 1 credit per character

Best for audiobooks, podcasts, and content requiring emotional depth.

### ElevenLabs Flash v2.5

Ultra-low latency (~75ms) voice model for real-time conversational use.

**Provider:** ElevenLabs
**Capability:** Text-to-Speech
**Pricing:** 0.5 credits per character

Best for real-time applications, chatbots, and interactive voice experiences.

### ElevenLabs Turbo v2.5

Balanced latency (~250ms) voice model.

**Provider:** ElevenLabs
**Capability:** Text-to-Speech
**Pricing:** 0.5 credits per character

### ElevenLabs Multilingual v2

Multi-language voice model supporting 32 languages.

**Provider:** ElevenLabs
**Capability:** Text-to-Speech
**Pricing:** 1 credit per character

Best for multilingual content and localization.

---

## Speech-to-Text Models

### Whisper 1

OpenAI's general-purpose speech recognition model with multilingual support.

**Provider:** OpenAI
**Capability:** Speech-to-Text
**Pricing:** $0.006 per minute
**Features:** Multilingual, timestamps, translation support

### Google STT

Google Cloud Speech-to-Text V2 API with streaming support.

**Provider:** Google
**Capability:** Speech-to-Text
**Pricing:** $0.016 per minute
**Features:** Real-time streaming, broad language support

---

# Real Use Cases for Friday

## Model-Based Use Cases

### Chat: Code Generation and Debugging

Ask Friday to write, explain, or debug code in any language.

```
f > Write a Python FastAPI server with JWT authentication and a /users endpoint
```

```
f > This function has a memory leak. Can you identify and fix it?
```

### Chat: Document Analysis

With Gemini 3 Pro's 1M token context window, process entire codebases or long documents.

```
f > Analyze this 200-page PDF and create an executive summary with key findings
```

### Chat: Research and Reasoning

Use GPT-5.2 Pro for complex multi-step reasoning tasks.

```
f > Compare the architectural trade-offs of microservices vs monolith for a 50-person team building a fintech platform
```

### Image Generation: Marketing Assets

Generate product images, social media graphics, and marketing materials.

```
f > /image A modern SaaS landing page hero image with abstract geometric shapes in purple and blue gradient
```

```
f > Create a set of 5 social media post images for a coffee brand launch
```

### Image Generation: UI/UX Mockups

Rapidly prototype visual designs.

```
f > /image A mobile app onboarding screen with a minimalist design, showing a welcome message and three feature cards
```

### Video Generation: Product Demos

Create short product demonstration videos from text descriptions.

```
f > Generate a 12-second video showing a mobile app with smooth screen transitions, a user tapping through a checkout flow
```

### Video Generation: Social Media Content

Create short-form video content for social platforms.

```
f > Create an 8-second video of a coffee cup on a wooden desk with steam rising, morning sunlight through a window, cinematic look
```

### Video Generation: Transcript to Video

Turn written content into visual media.

```
f > I have this podcast transcript about AI trends. Create a 12-second promotional video that captures the key themes with dynamic visuals
```

### Voice: Audiobook and Podcast Production

Convert written content to professional voice-over using ElevenLabs v3.

```
f > /voice Read this blog post in a warm, conversational tone suitable for a podcast intro
```

### Voice: Multilingual Content

Create voice-overs in multiple languages using ElevenLabs Multilingual v2.

```
f > Convert this product description to speech in Spanish, French, and Japanese
```

### Voice: Real-Time Narration

Use GPT-4o Mini TTS for instruction-following voice generation.

```
f > Read this error message in a calm, reassuring tone: "Your file could not be saved. Please check your disk space."
```

### Speech-to-Text: Meeting Transcription

Transcribe audio files to text using Whisper.

```
f > Transcribe this meeting recording and create action items from the discussion
```

### Multi-Modal Workflows

Chain multiple models together in a single conversation.

```
f > Transcribe this voice memo, summarize the key points, generate an image for each point, and create a PDF report
```

```
f > Take this blog post, generate a hero image, create a 30-second promotional video, and convert the summary to speech for a podcast teaser
```

---

## Plugin Use Cases

Plugins extend Friday with third-party service integrations. Install them with `/plugins`.

---

# Plugins

## Developer Plugins

### GitHub

Access GitHub repositories, issues, pull requests, and actions directly from Friday.

**Category:** Developer
**Credentials Required:** Personal Access Token (repo + workflow scopes)

**Installation:**

```
f > /plugins
> Install a plugin
> GitHub
> Enter your Personal Access Token: ****
```

**Use Cases:**

```
f > List my open pull requests and summarize the review comments
```

```
f > Create an issue in my-org/my-repo titled "Fix login timeout" with a description of the bug
```

```
f > Show me the CI status for my latest commit on the main branch
```

### Firecrawl

Web scraping and crawling powered by Firecrawl. Extract structured data from websites.

**Category:** Developer
**Credentials Required:** Firecrawl API key

**Use Cases:**

```
f > Scrape the pricing page of competitor.com and create a comparison table
```

```
f > Crawl docs.example.com and summarize the API reference
```

### Supabase

Manage Supabase databases and storage directly from the terminal.

**Category:** Developer
**Credentials Required:** Supabase Personal Access Token

**Use Cases:**

```
f > List all tables in my Supabase project and show their schemas
```

```
f > Create a new table called "notifications" with columns for user_id, message, read_at, and created_at
```

### Vercel

Manage Vercel deployments, projects, and domains.

**Category:** Developer
**Authentication:** Browser-based OAuth on first use

**Use Cases:**

```
f > Show me the deployment status of my production environment
```

```
f > List all my Vercel projects and their last deployment times
```

---

## Communication Plugins

### Slack

Read and send messages in Slack workspaces.

**Category:** Communication
**Credentials Required:** Slack Bot Token

**Installation:**

```
f > /plugins
> Install a plugin
> Slack
> Enter your Bot Token: ****
```

**Use Cases:**

```
f > Read the last 10 messages in #engineering and summarize them
```

```
f > Send a message to #general: "Deploy is complete, all systems green"
```

```
f > Search Slack for messages about the database migration from last week
```

### Discord

Read and send messages in Discord servers.

**Category:** Communication
**Credentials Required:** Discord Bot Token

**Use Cases:**

```
f > Read the last 20 messages in the #support channel
```

```
f > Send a message to #announcements: "Version 2.0 is now live!"
```

### Resend

Send transactional and marketing emails via Resend.

**Category:** Communication
**Credentials Required:** Resend API key, optional sender email

**Use Cases:**

```
f > Send a welcome email to user@example.com with a personalized onboarding message
```

```
f > Create an email template for order confirmations and send a test
```

### Gmail

Read, search, and send emails through your Gmail account.

**Category:** Communication
**Credentials Required:** Google Client ID and Client Secret (OAuth)

**Use Cases:**

```
f > Search my inbox for emails from @company.com in the last week and summarize them
```

```
f > Draft a reply to the latest email from my manager
```

---

## Social Plugins

### Reddit

Browse and post on Reddit.

**Category:** Social
**Credentials Required:** Client ID, Client Secret, username, password, user agent

**Use Cases:**

```
f > Show me the top 10 posts on r/programming today
```

```
f > Create a post on r/sideproject about my new CLI tool
```

### X (Twitter)

Post and read tweets on X/Twitter.

**Category:** Social
**Credentials Required:** API key, API secret, Access Token, Access Token Secret

**Use Cases:**

```
f > Post a tweet: "Just shipped v2.0 of our CLI tool with AI-powered code generation"
```

```
f > Show me my latest mentions and draft replies
```

### LinkedIn

Manage your LinkedIn profile and posts.

**Category:** Social
**Credentials Required:** LinkedIn Access Token (OAuth)

**Use Cases:**

```
f > Create a LinkedIn post about our team's latest product launch with a professional tone
```

```
f > Show my recent LinkedIn notifications
```

---

## Design Plugins

### Figma

Access Figma design files, components, and styles.

**Category:** Design
**Credentials Required:** Figma Personal Access Token

**Use Cases:**

```
f > List the components in my design system file
```

```
f > Get the CSS properties of the "Primary Button" component
```

```
f > Show me all the pages in our app design file and describe the layout of the homepage
```

---

## Productivity Plugins

### Google Drive

Access Google Drive files, Docs, Sheets, and Slides.

**Category:** Productivity
**Credentials Required:** Google Client ID and Client Secret (OAuth)

**Use Cases:**

```
f > Search my Google Drive for files related to "Q4 planning"
```

```
f > Read the contents of my "Meeting Notes" Google Doc and create action items
```

```
f > Create a new Google Sheet with a project timeline template
```

---

# Scheduled Agents

Friday can run tasks on a schedule using the `/schedule` command.

## Creating a Scheduled Agent

```
f > /schedule
> Create a new agent
> check my emails every morning at 9am
```

Friday parses natural language schedules:

| Input | Schedule |
|-------|----------|
| "every morning at 9am" | 0 9 * * * |
| "every hour" | 0 * * * * |
| "weekdays at 5pm" | 0 17 * * 1-5 |
| "every Monday at 10am" | 0 10 * * 1 |
| "every 30 minutes" | */30 * * * * |

## Managing Agents

- **View** — See all scheduled agents with their status and next run time
- **Trigger** — Run an agent immediately outside its schedule
- **Delete** — Remove a scheduled agent

---

# Security

## API Key Storage

API keys are stored in the system keychain (macOS Keychain, Windows Credential Manager, Linux libsecret) — never in plain text. Use `/keys` to manage them.

## Environment Isolation

API keys loaded into `process.env` are filtered before being passed to the AI agent or spawned processes. The agent cannot access your keys through environment variables or terminal commands.

## Input Protection

Any input that matches API key patterns is automatically blocked from being sent to the agent, preventing accidental key exposure.

## Permission System

Every tool action (file writes, terminal commands, media generation) goes through the permission system. Choose a profile that matches your trust level:

- **developer** — Auto-approve in workspace, ask for terminal
- **safe** — Read-only, ask for everything else
- **locked** — Ask for everything

---

# Troubleshooting

## No capabilities showing

Run `/keys` and add at least one API key. Each provider unlocks different capabilities:

- **OpenAI key** unlocks Chat, Images, Voice, and Video
- **Google key** unlocks Chat, Images, Voice, and Video
- **ElevenLabs key** unlocks premium Voice
- **Anthropic key** unlocks Chat (Claude)

## Plugin not working after install

Plugins require a restart to activate:

1. Press Ctrl+C to exit
2. Run `friday chat` to restart
3. Your chat history will auto-resume

## Permission errors

If you see "Permission needed" prompts too often, switch to the **developer** profile:

```
f > /config
> Change permission profile
> developer
```
