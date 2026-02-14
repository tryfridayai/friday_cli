/**
 * Agents & Skills API Endpoints
 * REST API for managing agents, skills, and user configurations
 */

import express from 'express';
import { agentManager } from '../agents/AgentManager.js';
import { skillManager } from '../skills/SkillManager.js';

const router = express.Router();

// ============================================================================
// Agent Endpoints
// ============================================================================

/**
 * GET /api/agents
 * Get all available agents for a user (global + custom)
 */
router.get('/agents', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const agents = await agentManager.getUserAgents(userId);

    res.json({ agents });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agents/:agentId
 * Get a specific agent configuration for a user
 */
router.get('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const agent = await agentManager.loadUserAgentConfig(userId, agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/:agentId/customize
 * Customize a global agent for a user
 */
router.post('/agents/:agentId/customize', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId, customizations } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const updatedConfig = await agentManager.saveUserAgentConfig(
      userId,
      agentId,
      customizations
    );

    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    console.error('Error customizing agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/:agentId/reset
 * Reset agent customizations to defaults
 */
router.post('/agents/:agentId/reset', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const defaultConfig = await agentManager.resetUserAgentConfig(userId, agentId);

    res.json({ success: true, config: defaultConfig });
  } catch (error) {
    console.error('Error resetting agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agents/custom
 * Create a completely custom agent
 */
router.post('/agents/custom', async (req, res) => {
  try {
    const { userId, agentData } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const newAgent = await agentManager.createUserAgent(userId, agentData);

    res.json({ success: true, agent: newAgent });
  } catch (error) {
    console.error('Error creating custom agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/agents/custom/:agentId
 * Update a custom agent
 */
router.put('/agents/custom/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId, updates } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const updatedAgent = await agentManager.updateUserAgent(userId, agentId, updates);

    res.json({ success: true, agent: updatedAgent });
  } catch (error) {
    console.error('Error updating custom agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/agents/custom/:agentId
 * Delete a custom agent
 */
router.delete('/agents/custom/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    await agentManager.deleteUserAgent(userId, agentId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom agent:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Skill Endpoints
// ============================================================================

/**
 * GET /api/skills
 * Get all available skills for a user (global + custom)
 */
router.get('/skills', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const skills = await skillManager.getUserAvailableSkills(userId);

    res.json(skills);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/skills/preferences
 * Get user's skill preferences (enabled/disabled)
 */
router.get('/skills/preferences', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const preferences = await skillManager.getUserSkillPreferences(userId);

    res.json(preferences);
  } catch (error) {
    console.error('Error fetching skill preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/skills/toggle
 * Toggle a skill enabled/disabled for a user
 */
router.post('/skills/toggle', async (req, res) => {
  try {
    const { userId, skillId, enabled } = req.body;

    if (!userId || !skillId || enabled === undefined) {
      return res.status(400).json({ error: 'userId, skillId, and enabled are required' });
    }

    const preferences = await skillManager.toggleSkill(userId, skillId, enabled);

    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Error toggling skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/skills
 * Create a new custom skill
 */
router.post('/skills', async (req, res) => {
  try {
    const { userId, ...skillData } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const newSkill = await skillManager.createUserSkill(userId, skillData);

    res.json({ success: true, skill: newSkill });
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/skills/:skillId
 * Update a custom skill
 */
router.put('/skills/:skillId', async (req, res) => {
  try {
    const { skillId } = req.params;
    const { userId, ...updates } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const updatedSkill = await skillManager.updateUserSkill(userId, skillId, updates);

    res.json({ success: true, skill: updatedSkill });
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/skills/:skillId
 * Delete a custom skill
 */
router.delete('/skills/:skillId', async (req, res) => {
  try {
    const { skillId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    await skillManager.deleteUserSkill(userId, skillId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/skills/search
 * Search skills by query
 */
router.get('/skills/search', async (req, res) => {
  try {
    const { userId, q } = req.query;

    if (!userId || !q) {
      return res.status(400).json({ error: 'userId and q (query) are required' });
    }

    const results = await skillManager.searchSkills(userId, q);

    res.json({ results });
  } catch (error) {
    console.error('Error searching skills:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
