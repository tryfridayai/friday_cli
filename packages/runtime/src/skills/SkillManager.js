/**
 * SkillManager
 * Manages global and user-specific skills for Friday AI agents
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SkillManager {
  constructor({
    globalSkillsPath = path.join(__dirname, 'global'),
    templatesPath = path.join(__dirname, 'templates'),
    userSkillsBasePath = path.join(__dirname, '../config/agents')
  } = {}) {
    this.globalSkillsPath = globalSkillsPath;
    this.templatesPath = templatesPath;
    this.userSkillsBasePath = userSkillsBasePath;

    // Cache for loaded skills
    this.globalSkillsCache = new Map();
    this.userSkillsCache = new Map();
    this.templatesCache = new Map();

    // Project type detection patterns
    this.projectTypePatterns = {
      react: {
        files: ['package.json'],
        patterns: ['"react":', '"react-dom":', '"next":', '"gatsby":', '"remix"'],
        templateId: 'react-development'
      },
      node: {
        files: ['package.json'],
        patterns: ['"express":', '"fastify":', '"koa":', '"nest":', '"hapi":', '"type": "module"'],
        templateId: 'nodejs-development'
      },
      python: {
        files: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
        patterns: ['pandas', 'numpy', 'scipy', 'matplotlib', 'sklearn', 'jupyter'],
        templateId: 'python-analysis'
      }
    };
  }

  /**
   * Load a single skill from markdown file
   */
  async loadSkillFromFile(filePath) {
    try {
      let content = await fs.readFile(filePath, 'utf8');

      // Normalize line endings (handle Windows \r\n)
      content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Parse YAML frontmatter if present
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (!frontmatterMatch) {
        // No frontmatter, treat entire content as skill content
        console.log('[SkillManager] No frontmatter found in:', path.basename(filePath));
        return {
          id: path.basename(filePath, '.md'),
          name: path.basename(filePath, '.md'),
          content: content.trim(),
          isGlobal: filePath.startsWith(this.globalSkillsPath),
        };
      }

      // Parse YAML frontmatter (simple key: value parser)
      const frontmatter = frontmatterMatch[1];
      const skillContent = frontmatterMatch[2].trim();

      const metadata = {};
      frontmatter.split('\n').forEach(line => {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          metadata[key] = value.trim();
        }
      });

      return {
        id: metadata.id || metadata.name || path.basename(filePath, '.md'),
        name: metadata.name || path.basename(filePath, '.md'),
        type: metadata.type || 'internal', // 'expert' or 'internal'
        description: metadata.description || '',
        tags: metadata.tags ? metadata.tags.split(',').map(t => t.trim()) : [],
        content: skillContent,
        isGlobal: filePath.startsWith(this.globalSkillsPath),
        filePath
      };
    } catch (error) {
      console.error(`[SkillManager] Error loading skill from ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Load all global skills
   */
  async loadGlobalSkills() {
    // Check cache
    if (this.globalSkillsCache.size > 0) {
      console.log('[SkillManager] Returning cached skills:', this.globalSkillsCache.size);
      return Array.from(this.globalSkillsCache.values());
    }

    console.log('[SkillManager] Loading global skills from:', this.globalSkillsPath);

    try {
      await fs.mkdir(this.globalSkillsPath, { recursive: true });
      const files = await fs.readdir(this.globalSkillsPath);
      console.log('[SkillManager] Found files:', files.length, 'md files:', files.filter(f => f.endsWith('.md')).length);

      const skills = [];
      for (const file of files) {
        if (file.endsWith('.md')) {
          const skillPath = path.join(this.globalSkillsPath, file);
          const skill = await this.loadSkillFromFile(skillPath);
          if (skill) {
            skills.push(skill);
            this.globalSkillsCache.set(skill.id, skill);
          }
        }
      }

      console.log('[SkillManager] Loaded skills:', skills.length);
      return skills;
    } catch (error) {
      console.error('[SkillManager] Error loading global skills:', error.message);
      return [];
    }
  }

  /**
   * Get a specific global skill by ID
   */
  async getGlobalSkill(skillId) {
    if (this.globalSkillsCache.has(skillId)) {
      return this.globalSkillsCache.get(skillId);
    }

    // Try to load it
    const skills = await this.loadGlobalSkills();
    return skills.find(s => s.id === skillId);
  }

  // ============================================
  // EXPERT/INTERNAL SKILL METHODS (Two-Tier System)
  // ============================================

  /**
   * Get expert skills for frontend UI
   * Expert skills are user-facing personas (Designer, Developer, Analyst)
   * Returns only metadata, not full content
   */
  async getExpertSkills() {
    const allSkills = await this.loadGlobalSkills();

    // Debug: Log ALL skill types to trace filtering issue
    const types = allSkills.map(s => ({ id: s.id, type: s.type, name: s.name }));
    console.log('[SkillManager] Total skills loaded:', allSkills.length);
    console.log('[SkillManager] All skills with types:', JSON.stringify(types, null, 2));

    const expertSkills = allSkills.filter(s => s.type === 'expert');
    console.log('[SkillManager] Expert skills found:', expertSkills.length);
    console.log('[SkillManager] Expert skill names:', expertSkills.map(s => s.name));

    return expertSkills.map(({ id, name, description }) => ({ id, name, description }));
  }

  /**
   * Get internal skill index for agent auto-selection
   * Returns lightweight index with id + short hint (max 80 chars)
   * Agent uses this to decide which skills to load
   */
  async getInternalSkillIndex() {
    const allSkills = await this.loadGlobalSkills();
    return allSkills
      .filter(s => s.type === 'internal' || !s.type) // Default to internal if no type
      .map(({ id, name, description }) => ({
        id,
        name,
        hint: description ? description.slice(0, 80) : name
      }));
  }

  /**
   * Load full skill content by IDs
   * Used to load expert skills (user-tagged) and internal skills (agent-selected)
   * @param {string[]} ids - Array of skill IDs to load
   * @returns {Promise<Array>} Array of skills with full content
   */
  async loadSkillsByIds(ids) {
    if (!ids || ids.length === 0) {
      return [];
    }

    const allSkills = await this.loadGlobalSkills();
    return allSkills.filter(s => ids.includes(s.id));
  }

  /**
   * Resolve active skills for a specific query
   * Logic:
   * 1. ALWAYS load "Core" skills (if any marked as core)
   * 2. LOAD explicitly mentioned skills (via @tag)
   * 3. (Optional) Load auto-detected skills (can be disabled via flag)
   */
  async resolveActiveSkills(userId, mentionedSkillIds = []) {
    const availableSkills = await this.getUserAvailableSkills(userId);
    const allSkills = availableSkills.all;

    // 1. Identify Mentioned Skills
    const activeSkills = [];
    const seenIds = new Set();

    if (mentionedSkillIds && mentionedSkillIds.length > 0) {
      for (const id of mentionedSkillIds) {
        const skill = allSkills.find(s => s.id === id);
        if (skill && !seenIds.has(skill.id)) {
          activeSkills.push(skill);
          seenIds.add(skill.id);
        }
      }
    }

    // 2. (Optional) Add logic here if you want "Core/Global" skills to always be present
    // Example: const coreSkills = allSkills.filter(s => s.tags.includes('core'));
    
    return activeSkills;
  }
  
  /**
   * Get user skills path
   */
  getUserSkillsPath(userId) {
    return path.join(this.userSkillsBasePath, userId, 'skills');
  }

  /**
   * Load all user-specific skills
   */
  async loadUserSkills(userId) {
    const cacheKey = userId;
    if (this.userSkillsCache.has(cacheKey)) {
      return this.userSkillsCache.get(cacheKey);
    }

    const userSkillsPath = this.getUserSkillsPath(userId);

    try {
      const files = await fs.readdir(userSkillsPath);
      const skills = [];

      for (const file of files) {
        if (file.endsWith('.md')) {
          const skillPath = path.join(userSkillsPath, file);
          const skill = await this.loadSkillFromFile(skillPath);
          if (skill) {
            skills.push({
              ...skill,
              isGlobal: false,
              isCustom: true,
              userId
            });
          }
        }
      }

      this.userSkillsCache.set(cacheKey, skills);
      return skills;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // No user skills directory
        return [];
      }
      console.error(`Error loading user skills for ${userId}:`, error.message);
      return [];
    }
  }

  /**
   * Get all skills available to a user (global + custom)
   */
  async getUserAvailableSkills(userId) {
    const globalSkills = await this.loadGlobalSkills();
    const userSkills = await this.loadUserSkills(userId);

    return {
      global: globalSkills,
      custom: userSkills,
      all: [...globalSkills, ...userSkills]
    };
  }

  /**
   * Create a new user skill
   */
  async createUserSkill(userId, skillData) {
    if (!skillData.id || !skillData.name || !skillData.content) {
      throw new Error('Skill must have id, name, and content');
    }

    // Ensure user skills directory exists
    const userSkillsPath = this.getUserSkillsPath(userId);
    await fs.mkdir(userSkillsPath, { recursive: true });

    // Check if skill already exists
    const existingSkillPath = path.join(userSkillsPath, `${skillData.id}.md`);
    try {
      await fs.access(existingSkillPath);
      throw new Error(`Skill "${skillData.id}" already exists`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Create skill content with frontmatter
    const frontmatter = [
      '---',
      `id: ${skillData.id}`,
      `name: ${skillData.name}`,
      `description: ${skillData.description || ''}`,
      `tags: ${(skillData.tags || []).join(', ')}`,
      `visibility: ${skillData.visibility || 'private'}`,
      `createdAt: ${new Date().toISOString()}`,
      `createdBy: ${userId}`,
      '---',
      '',
      skillData.content
    ].join('\n');

    // Save skill file
    await fs.writeFile(existingSkillPath, frontmatter, 'utf8');

    // Clear cache
    this.userSkillsCache.delete(userId);

    // Return created skill
    return {
      id: skillData.id,
      name: skillData.name,
      description: skillData.description || '',
      tags: skillData.tags || [],
      content: skillData.content,
      visibility: skillData.visibility || 'private',
      isGlobal: false,
      isCustom: true,
      userId,
      filePath: existingSkillPath
    };
  }

  /**
   * Update a user skill
   */
  async updateUserSkill(userId, skillId, updates) {
    const userSkillsPath = this.getUserSkillsPath(userId);
    const skillPath = path.join(userSkillsPath, `${skillId}.md`);

    // Load existing skill
    const existingSkill = await this.loadSkillFromFile(skillPath);
    if (!existingSkill) {
      throw new Error(`Skill "${skillId}" not found`);
    }

    // Merge updates
    const updatedSkill = {
      ...existingSkill,
      ...updates,
      id: existingSkill.id // Preserve ID
    };

    // Create updated content with frontmatter
    const frontmatter = [
      '---',
      `id: ${updatedSkill.id}`,
      `name: ${updatedSkill.name}`,
      `description: ${updatedSkill.description || ''}`,
      `tags: ${(updatedSkill.tags || []).join(', ')}`,
      `visibility: ${updatedSkill.visibility || 'private'}`,
      `updatedAt: ${new Date().toISOString()}`,
      '---',
      '',
      updatedSkill.content
    ].join('\n');

    // Save updated skill
    await fs.writeFile(skillPath, frontmatter, 'utf8');

    // Clear cache
    this.userSkillsCache.delete(userId);

    return updatedSkill;
  }

  /**
   * Delete a user skill
   */
  async deleteUserSkill(userId, skillId) {
    const userSkillsPath = this.getUserSkillsPath(userId);
    const skillPath = path.join(userSkillsPath, `${skillId}.md`);

    try {
      await fs.unlink(skillPath);
      this.userSkillsCache.delete(userId);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Skill "${skillId}" not found`);
      }
      throw error;
    }
  }

  /**
   * Get user's skill preferences (enabled/disabled skills)
   */
  async getUserSkillPreferences(userId) {
    const preferencesPath = path.join(
      this.userSkillsBasePath,
      userId,
      'skill-preferences.json'
    );

    try {
      const data = await fs.readFile(preferencesPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Default: all global skills enabled, all custom skills enabled
        return {
          enabledSkills: [],
          disabledSkills: []
        };
      }
      throw error;
    }
  }

  /**
   * Update user's skill preferences
   */
  async updateUserSkillPreferences(userId, preferences) {
    const preferencesPath = path.join(
      this.userSkillsBasePath,
      userId,
      'skill-preferences.json'
    );

    // Ensure directory exists
    await fs.mkdir(path.dirname(preferencesPath), { recursive: true });

    // Save preferences
    await fs.writeFile(
      preferencesPath,
      JSON.stringify(preferences, null, 2),
      'utf8'
    );

    return preferences;
  }

  /**
   * Toggle skill enabled/disabled for a user
   */
  async toggleSkill(userId, skillId, enabled) {
    const preferences = await this.getUserSkillPreferences(userId);

    if (enabled) {
      // Enable skill: remove from disabled list, add to enabled list
      preferences.disabledSkills = (preferences.disabledSkills || [])
        .filter(id => id !== skillId);

      if (!preferences.enabledSkills) {
        preferences.enabledSkills = [];
      }
      if (!preferences.enabledSkills.includes(skillId)) {
        preferences.enabledSkills.push(skillId);
      }
    } else {
      // Disable skill: remove from enabled list, add to disabled list
      preferences.enabledSkills = (preferences.enabledSkills || [])
        .filter(id => id !== skillId);

      if (!preferences.disabledSkills) {
        preferences.disabledSkills = [];
      }
      if (!preferences.disabledSkills.includes(skillId)) {
        preferences.disabledSkills.push(skillId);
      }
    }

    await this.updateUserSkillPreferences(userId, preferences);

    return preferences;
  }

  /**
   * Get enabled skills for a user with content loaded
   */
  async getEnabledSkillsForUser(userId) {
    const [availableSkills, preferences] = await Promise.all([
      this.getUserAvailableSkills(userId),
      this.getUserSkillPreferences(userId)
    ]);

    const { enabledSkills, disabledSkills } = preferences;

    // Filter skills based on preferences
    // Default: all skills enabled unless explicitly disabled
    const enabledSkillsList = availableSkills.all.filter(skill => {
      // If explicitly disabled, exclude
      if (disabledSkills && disabledSkills.includes(skill.id)) {
        return false;
      }

      // If we have an explicit enabled list, check it
      if (enabledSkills && enabledSkills.length > 0) {
        return enabledSkills.includes(skill.id);
      }

      // Otherwise, include by default
      return true;
    });

    return enabledSkillsList;
  }

  /**
   * Get skills for a specific agent role
   */
  async getSkillsForAgent(userId, agentId) {
    const enabledSkills = await this.getEnabledSkillsForUser(userId);

    // Filter skills that are tagged for this agent
    // For now, return all enabled skills
    // In the future, you could filter by agent tags
    return enabledSkills;
  }

  /**
   * Search skills by query (name, description, tags, content)
   */
  async searchSkills(userId, query) {
    const availableSkills = await this.getUserAvailableSkills(userId);
    const lowerQuery = query.toLowerCase();

    return availableSkills.all.filter(skill => {
      return (
        skill.name.toLowerCase().includes(lowerQuery) ||
        (skill.description && skill.description.toLowerCase().includes(lowerQuery)) ||
        (skill.tags && skill.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) ||
        skill.content.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Clear all caches
   */
  clearCache() {
    this.globalSkillsCache.clear();
    this.userSkillsCache.clear();
    this.templatesCache.clear();
  }

  // ============================================
  // TEMPLATE METHODS
  // ============================================

  /**
   * Load all skill templates
   */
  async loadTemplates() {
    if (this.templatesCache.size > 0) {
      return Array.from(this.templatesCache.values());
    }

    try {
      await fs.mkdir(this.templatesPath, { recursive: true });
      const files = await fs.readdir(this.templatesPath);

      const templates = [];
      for (const file of files) {
        if (file.endsWith('.md')) {
          const templatePath = path.join(this.templatesPath, file);
          const template = await this.loadSkillFromFile(templatePath);
          if (template) {
            // Parse projectTypes from frontmatter
            const content = await fs.readFile(templatePath, 'utf8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (frontmatterMatch) {
              const projectTypesMatch = frontmatterMatch[1].match(/projectTypes:\s*(.+)/);
              if (projectTypesMatch) {
                template.projectTypes = projectTypesMatch[1].split(',').map(t => t.trim());
              }
            }
            template.isTemplate = true;
            templates.push(template);
            this.templatesCache.set(template.id, template);
          }
        }
      }

      return templates;
    } catch (error) {
      console.error('Error loading templates:', error.message);
      return [];
    }
  }

  /**
   * Get a specific template by ID
   */
  async getTemplate(templateId) {
    if (this.templatesCache.has(templateId)) {
      return this.templatesCache.get(templateId);
    }

    const templates = await this.loadTemplates();
    return templates.find(t => t.id === templateId);
  }

  /**
   * Get templates for a specific project type
   */
  async getTemplatesForProjectType(projectType) {
    const templates = await this.loadTemplates();
    return templates.filter(t =>
      t.projectTypes && t.projectTypes.includes(projectType)
    );
  }

  // ============================================
  // WORKSPACE DETECTION METHODS
  // ============================================

  /**
   * Detect project type from workspace path
   */
  async detectProjectType(workspacePath) {
    if (!workspacePath) {
      return { projectTypes: [], suggestions: [] };
    }

    const detectedTypes = [];
    const suggestions = [];

    for (const [projectType, config] of Object.entries(this.projectTypePatterns)) {
      for (const fileName of config.files) {
        const filePath = path.join(workspacePath, fileName);
        try {
          const content = await fs.readFile(filePath, 'utf8');

          // Check if any patterns match
          const matchedPatterns = config.patterns.filter(pattern =>
            content.includes(pattern)
          );

          if (matchedPatterns.length > 0) {
            detectedTypes.push({
              type: projectType,
              confidence: Math.min(matchedPatterns.length / config.patterns.length, 1),
              matchedPatterns,
              templateId: config.templateId
            });
          }
        } catch (error) {
          // File doesn't exist, continue
        }
      }
    }

    // Sort by confidence
    detectedTypes.sort((a, b) => b.confidence - a.confidence);

    // Get template suggestions
    for (const detected of detectedTypes) {
      const template = await this.getTemplate(detected.templateId);
      if (template) {
        suggestions.push({
          template,
          projectType: detected.type,
          confidence: detected.confidence,
          reason: `Detected ${detected.matchedPatterns.join(', ')} in project files`
        });
      }
    }

    return {
      projectTypes: detectedTypes.map(d => d.type),
      suggestions
    };
  }

  /**
   * Get suggested skills for a workspace
   * Returns both global skills and template-based suggestions
   */
  async getSuggestedSkillsForWorkspace(userId, workspacePath) {
    const [availableSkills, detection] = await Promise.all([
      this.getUserAvailableSkills(userId),
      this.detectProjectType(workspacePath)
    ]);

    const result = {
      globalSkills: availableSkills.global,
      customSkills: availableSkills.custom,
      suggestedTemplates: detection.suggestions,
      detectedProjectTypes: detection.projectTypes
    };

    return result;
  }

  /**
   * Create a skill from a template for a user
   */
  async createSkillFromTemplate(userId, templateId, customizations = {}) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    const skillData = {
      id: customizations.id || `${template.id}-${Date.now()}`,
      name: customizations.name || template.name,
      description: customizations.description || template.description,
      tags: customizations.tags || template.tags,
      content: customizations.content || template.content,
      visibility: customizations.visibility || 'private',
      basedOnTemplate: templateId
    };

    return this.createUserSkill(userId, skillData);
  }

  /**
   * Apply template skills to user's enabled skills
   */
  async applyTemplateToUser(userId, templateId) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" not found`);
    }

    // Create a copy of the template as a user skill
    const skill = await this.createSkillFromTemplate(userId, templateId, {
      id: template.id, // Use template ID as skill ID
      name: template.name,
      visibility: 'private'
    });

    // Enable the skill for the user
    await this.toggleSkill(userId, skill.id, true);

    return skill;
  }
}

// Export singleton instance
export const skillManager = new SkillManager();
