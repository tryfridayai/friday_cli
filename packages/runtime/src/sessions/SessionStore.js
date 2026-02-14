import fs from 'fs'
import { promises as fsPromises } from 'fs'
import path from 'path'

const DEFAULT_TOKENS = {
  input: 0,
  output: 0,
  cacheCreation: 0,
  cacheRead: 0
}

export class SessionStore {
  constructor({ basePath }) {
    this.basePath = basePath
    this.metadataCache = new Map()
    this.indexPath = path.join(this.basePath, 'sessions.index.json')
    fs.mkdirSync(this.basePath, { recursive: true })
    this.loadIndex()
  }

  loadIndex() {
    try {
      if (fs.existsSync(this.indexPath)) {
        const raw = fs.readFileSync(this.indexPath, 'utf8')
        const sessions = JSON.parse(raw)
        sessions.forEach((session) => {
          if (session?.id) {
            this.metadataCache.set(session.id, session)
          }
        })
        return
      }
    } catch (error) {
      console.error('[SessionStore] Failed to parse index', error.message)
    }

    try {
      const entries = fs.readdirSync(this.basePath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === '.DS_Store') continue
        const metadata = this.readMetadataFromDisk(entry.name)
        if (metadata) {
          this.metadataCache.set(entry.name, metadata)
        }
      }
      this.persistIndex()
    } catch (error) {
      console.error('[SessionStore] Failed to scan sessions directory', error.message)
    }
  }

  readMetadataFromDisk(sessionId) {
    try {
      const metaPath = this.getMetadataPath(sessionId)
      if (!fs.existsSync(metaPath)) {
        return null
      }
      const raw = fs.readFileSync(metaPath, 'utf8')
      return JSON.parse(raw)
    } catch (error) {
      console.error(`[SessionStore] Failed to read metadata for ${sessionId}: ${error.message}`) // eslint-disable-line no-console
      return null
    }
  }

  async persistIndex() {
    const sessions = Array.from(this.metadataCache.values()).sort((a, b) => {
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    })
    await fsPromises.writeFile(this.indexPath, JSON.stringify(sessions, null, 2), 'utf8')
  }

  getSessionDir(sessionId) {
    return path.join(this.basePath, sessionId)
  }

  getMetadataPath(sessionId) {
    return path.join(this.getSessionDir(sessionId), 'metadata.json')
  }

  getLogPath(sessionId) {
    return path.join(this.getSessionDir(sessionId), 'events.jsonl')
  }

  async ensureSession(sessionId, defaults = {}) {
    if (!sessionId) return null
    let metadata = this.metadataCache.get(sessionId)
    if (!metadata) {
      const now = new Date().toISOString()
      metadata = {
        id: sessionId,
        title: defaults.title || this.defaultTitle(sessionId, defaults.firstMessage),
        workspacePath: defaults.workspacePath || '',
        createdAt: defaults.createdAt || now,
        updatedAt: defaults.updatedAt || now,
        messageCount: defaults.messageCount || 0,
        totalTokens: { ...DEFAULT_TOKENS },
        lastUserMessage: defaults.firstMessage || '',
        model: defaults.model || null,
        status: 'active',
        tags: defaults.tags || []
      }
      await fsPromises.mkdir(this.getSessionDir(sessionId), { recursive: true })
      await this.writeMetadata(sessionId, metadata)
    } else {
      let updated = false
      if (defaults.workspacePath && metadata.workspacePath !== defaults.workspacePath) {
        metadata.workspacePath = defaults.workspacePath
        updated = true
      }
      if (defaults.title && metadata.title === this.defaultTitle(metadata.id)) {
        metadata.title = defaults.title
        updated = true
      }
      if (defaults.model && !metadata.model) {
        metadata.model = defaults.model
        updated = true
      }
      if (defaults.updatedAt) {
        metadata.updatedAt = defaults.updatedAt
        updated = true
      }
      if (updated) {
        await this.writeMetadata(sessionId, metadata)
      }
    }
    return metadata
  }

  async writeMetadata(sessionId, metadata) {
    const metaPath = this.getMetadataPath(sessionId)
    await fsPromises.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8')
    this.metadataCache.set(sessionId, metadata)
    await this.persistIndex()
  }

  defaultTitle(sessionId, firstMessage = '') {
    if (firstMessage) {
      const normalized = firstMessage.trim().replace(/\s+/g, ' ')
      if (normalized.length > 0) {
        return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized
      }
    }
    return `Session ${sessionId.slice(0, 8)}`
  }

  async appendEvent(sessionId, event, defaults = {}) {
    if (!sessionId) return
    await this.ensureSession(sessionId, defaults)
    const logEntry = {
      timestamp: new Date().toISOString(),
      direction: event.direction,
      payload: event.payload
    }
    await fsPromises.appendFile(this.getLogPath(sessionId), `${JSON.stringify(logEntry)}\n`, 'utf8')

    const metadata = this.metadataCache.get(sessionId)
    if (metadata) {
      const updates = {}
      const payloadType = event.payload?.type
      if (payloadType === 'query') {
        updates.messageCount = (metadata.messageCount || 0) + 1
        if (event.payload?.message) {
          updates.lastUserMessage = event.payload.message.slice(0, 200)
        }
      }
      updates.updatedAt = logEntry.timestamp
      await this.updateMetadata(sessionId, updates)
    }
  }

  async updateMetadata(sessionId, updates = {}) {
    const metadata = this.metadataCache.get(sessionId)
    if (!metadata) {
      return
    }
    const next = { ...metadata, ...updates }
    if (updates.totalTokens) {
      next.totalTokens = { ...metadata.totalTokens, ...updates.totalTokens }
    }
    await this.writeMetadata(sessionId, next)
  }

  async updateUsage(sessionId, usage = {}) {
    if (!sessionId) return
    await this.ensureSession(sessionId)
    const metadata = this.metadataCache.get(sessionId)
    if (!metadata) return
    const totals = { ...metadata.totalTokens } || { ...DEFAULT_TOKENS }
    const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)
    const output = usage.output_tokens || 0
    totals.input += input
    totals.output += output
    totals.cacheCreation += (usage.cache_creation_input_tokens || 0) + (usage.cache_creation_output_tokens || 0)
    totals.cacheRead += usage.cache_read_input_tokens || 0
    await this.updateMetadata(sessionId, {
      totalTokens: totals,
      updatedAt: new Date().toISOString()
    })
  }

  async listSessions(limit = 100) {
    const sessions = Array.from(this.metadataCache.values()).sort((a, b) => {
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    })
    return sessions.slice(0, limit)
  }

  async getSessionMetadata(sessionId) {
    await this.ensureSession(sessionId)
    return this.metadataCache.get(sessionId) || null
  }

  async getSessionEvents(sessionId, { limit = 500 } = {}) {
    const logPath = this.getLogPath(sessionId)
    if (!fs.existsSync(logPath)) {
      return []
    }
    const data = await fsPromises.readFile(logPath, 'utf8')
    const lines = data.split('\n').filter(Boolean)
    const slice = lines.slice(-limit)
    return slice
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch (_) {
          return null
        }
      })
      .filter(Boolean)
  }

  async deleteSession(sessionId) {
    const dir = this.getSessionDir(sessionId)
    if (fs.existsSync(dir)) {
      await fsPromises.rm(dir, { recursive: true, force: true })
    }
    this.metadataCache.delete(sessionId)
    await this.persistIndex()
  }

  /**
   * Update the screen context for a session
   * Called after agent analyzes a screenshot
   * @param {string} sessionId - The session ID
   * @param {string} context - The extracted screen context/analysis
   */
  async updateScreenContext(sessionId, context) {
    if (!sessionId) return
    await this.ensureSession(sessionId)
    await this.updateMetadata(sessionId, {
      screenContext: context,
      screenContextUpdatedAt: new Date().toISOString(),
      hasUsedScreenShare: true
    })
  }

  /**
   * Get the screen context for a session
   * @param {string} sessionId - The session ID
   * @returns {Object|null} Screen context info or null
   */
  async getScreenContext(sessionId) {
    if (!sessionId) return null
    const metadata = this.metadataCache.get(sessionId)
    if (!metadata) return null
    return {
      context: metadata.screenContext || null,
      updatedAt: metadata.screenContextUpdatedAt || null,
      hasUsedScreenShare: metadata.hasUsedScreenShare || false
    }
  }

  /**
   * Clear screen context (e.g., when screen sharing is stopped)
   * @param {string} sessionId - The session ID
   */
  async clearScreenContext(sessionId) {
    if (!sessionId) return
    await this.updateMetadata(sessionId, {
      screenContext: null,
      screenContextUpdatedAt: null
      // Keep hasUsedScreenShare true - it's historical
    })
  }

  // ============================================
  // ACTIVE INTERNAL SKILLS (Two-Tier Skill System)
  // ============================================

  /**
   * Get active internal skills for a session
   * These are skills the agent has selected via select_skills tool
   * @param {string} sessionId - The session ID
   * @returns {string[]} Array of active internal skill IDs
   */
  async getActiveInternalSkills(sessionId) {
    if (!sessionId) return []
    const metadata = this.metadataCache.get(sessionId)
    return metadata?.activeInternalSkills || []
  }

  /**
   * Set active internal skills for a session (replaces existing)
   * Called when agent uses select_skills tool
   * @param {string} sessionId - The session ID
   * @param {string[]} skillIds - Array of skill IDs (max 2)
   */
  async setActiveInternalSkills(sessionId, skillIds) {
    if (!sessionId) return
    await this.ensureSession(sessionId)
    // Enforce max 2 internal skills per query
    const limitedSkillIds = (skillIds || []).slice(0, 2)
    await this.updateMetadata(sessionId, {
      activeInternalSkills: limitedSkillIds,
      activeInternalSkillsUpdatedAt: new Date().toISOString()
    })
  }

  /**
   * Clear active internal skills (e.g., when starting new topic)
   * @param {string} sessionId - The session ID
   */
  async clearActiveInternalSkills(sessionId) {
    if (!sessionId) return
    await this.updateMetadata(sessionId, {
      activeInternalSkills: [],
      activeInternalSkillsUpdatedAt: new Date().toISOString()
    })
  }
}

export default SessionStore
