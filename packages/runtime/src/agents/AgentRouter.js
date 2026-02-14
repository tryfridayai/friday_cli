/**
 * AgentRouter - Intelligent agent selection based on task analysis
 *
 * Analyzes user messages and selects the most appropriate agent(s)
 * for the task at hand.
 *
 * Uses keyword-based routing by default, with optional AI-powered routing
 * when the Anthropic SDK is available.
 */

import { agentManager } from './AgentManager.js';

// Try to import Anthropic SDK (optional)
let Anthropic = null;
try {
  const module = await import('@anthropic-ai/sdk');
  Anthropic = module.default;
} catch {
  console.log('[AgentRouter] Anthropic SDK not available, using keyword-based routing');
}

class AgentRouter {
  constructor() {
    this.client = null;
    this.routerModel = 'claude-3-5-haiku-20241022'; // Fast, cheap model for routing
    this.useAIRouting = !!Anthropic && !!process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Initialize the Anthropic client (if available)
   */
  initClient() {
    if (!this.client && Anthropic && process.env.ANTHROPIC_API_KEY) {
      this.client = new Anthropic();
    }
    return this.client;
  }

  /**
   * Analyze a user message and determine the best agent(s) to handle it
   *
   * @param {string} message - The user's message
   * @param {Object} context - Additional context (workspace type, recent history, etc.)
   * @returns {Object} - { primaryAgent: string, confidence: number, reasoning: string, suggestedAgents?: string[] }
   */
  async routeMessage(message, context = {}) {
    // Use fallback routing if AI routing is not available
    if (!this.useAIRouting) {
      return this.fallbackRouting(message);
    }

    const agents = agentManager.getGlobalAgents();

    // Build agent descriptions for the router
    const agentDescriptions = agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      expertise: agent.defaultSkills || [],
      category: agent.category
    }));

    const routerPrompt = `You are an intelligent task router for Friday AI. Analyze the user's message and determine which specialized agent should handle it.

## Available Agents:
${agentDescriptions.map(a => `- **${a.id}** (${a.name}): ${a.role}
  Category: ${a.category}
  Expertise: ${a.expertise.join(', ')}`).join('\n\n')}

## Context:
- Workspace type: ${context.workspaceType || 'unknown'}
- Recent conversation topic: ${context.recentTopic || 'none'}

## User Message:
"${message}"

## Instructions:
Analyze the user's message and respond with a JSON object:
{
  "primaryAgent": "agent-id",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this agent is best suited",
  "suggestedAgents": ["agent-id-1", "agent-id-2"] // Optional: for complex tasks requiring multiple agents
}

Consider:
1. UI/UX design questions → ui-designer
2. Frontend code, React, Vue, components → frontend-developer
3. Backend, APIs, databases, security → backend-developer
4. Data analysis, charts, metrics, reporting → analyst

For complex tasks that span multiple domains (e.g., "build a complete app"), suggest the primary agent to start with and list others in suggestedAgents.

Respond ONLY with the JSON object, no other text.`;

    try {
      this.initClient();

      const response = await this.client.messages.create({
        model: this.routerModel,
        max_tokens: 256,
        messages: [{ role: 'user', content: routerPrompt }]
      });

      const content = response.content[0]?.text || '';

      // Parse the JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        // Validate the agent ID
        const validAgentIds = agents.map(a => a.id);
        if (!validAgentIds.includes(result.primaryAgent)) {
          // Fallback to ui-designer if invalid
          result.primaryAgent = 'ui-designer';
          result.confidence = 0.5;
        }

        return result;
      }

      // Fallback if parsing fails
      return this.fallbackRouting(message);
    } catch (error) {
      console.error('[AgentRouter] Error routing message:', error.message);
      return this.fallbackRouting(message);
    }
  }

  /**
   * Simple keyword-based fallback routing when AI routing fails
   */
  fallbackRouting(message) {
    const lowerMessage = message.toLowerCase();
    const matchedAgents = [];

    // Data/Analytics keywords
    const dataKeywords = /\b(data|analytics?|metrics?|chart|graph|visualization?|report|dashboard|statistics?|sql|query|dataset|analyze|analysis)\b/;
    if (dataKeywords.test(lowerMessage)) {
      matchedAgents.push({ agent: 'analyst', reason: 'data/analytics' });
    }

    // Backend keywords (expanded)
    const backendKeywords = /\b(api|backend|server|database|db|auth|authentication|security|endpoint|rest|graphql|node|express|mongodb|postgres|redis|login|signup|register|payment|stripe|paypal|email|notification|webhook|integration|subscription)\b/;
    if (backendKeywords.test(lowerMessage)) {
      matchedAgents.push({ agent: 'backend-developer', reason: 'backend/API' });
    }

    // Frontend keywords (expanded)
    const frontendKeywords = /\b(react|vue|angular|component|frontend|javascript|typescript|css|tailwind|html|dom|state|hook|redux|cart|checkout|form|button|page|navigation|router|store|ecommerce|shop|product)\b/;
    if (frontendKeywords.test(lowerMessage)) {
      matchedAgents.push({ agent: 'frontend-developer', reason: 'frontend' });
    }

    // Design keywords (expanded)
    const designKeywords = /\b(design|ui|ux|layout|wireframe|mockup|prototype|color|typography|spacing|accessibility|responsive|mobile|figma|sketch|theme|branding|style)\b/;
    if (designKeywords.test(lowerMessage)) {
      matchedAgents.push({ agent: 'ui-designer', reason: 'design/UX' });
    }

    // No matches - default to UI Designer
    if (matchedAgents.length === 0) {
      return {
        primaryAgent: 'ui-designer',
        confidence: 0.5,
        reasoning: 'No specific domain detected, defaulting to UI Designer'
      };
    }

    // Single match - return that agent
    if (matchedAgents.length === 1) {
      return {
        primaryAgent: matchedAgents[0].agent,
        confidence: 0.75,
        reasoning: `Message contains ${matchedAgents[0].reason} keywords`
      };
    }

    // Multiple matches - complex task requiring multiple agents
    // Prioritize: backend > frontend > design > analyst
    const priority = ['backend-developer', 'frontend-developer', 'ui-designer', 'analyst'];
    const primaryAgent = priority.find(id => matchedAgents.some(m => m.agent === id)) || matchedAgents[0].agent;
    const suggestedAgents = matchedAgents.map(m => m.agent).filter(id => id !== primaryAgent);

    return {
      primaryAgent,
      confidence: 0.8,
      reasoning: `Complex task spanning ${matchedAgents.map(m => m.reason).join(', ')}. Starting with ${primaryAgent}.`,
      suggestedAgents
    };
  }

  /**
   * Check if a task requires multiple agents (orchestration)
   */
  isComplexTask(routingResult) {
    return routingResult.suggestedAgents && routingResult.suggestedAgents.length > 1;
  }

  /**
   * Get agent transition recommendation for multi-agent tasks
   */
  getAgentSequence(routingResult) {
    if (!this.isComplexTask(routingResult)) {
      return [routingResult.primaryAgent];
    }

    // Return primary agent first, then suggested agents
    const sequence = [routingResult.primaryAgent];
    for (const agentId of routingResult.suggestedAgents) {
      if (!sequence.includes(agentId)) {
        sequence.push(agentId);
      }
    }
    return sequence;
  }
}

export const agentRouter = new AgentRouter();
export { AgentRouter };
