/**
 * Test script for Agent and Skill system
 * Run with: node backend_new/src/agents/test-agents.js
 */

import { agentManager } from './AgentManager.js';
import { skillManager } from '../skills/SkillManager.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testAgentSystem() {
  console.log('='.repeat(60));
  console.log('Testing Friday AI Agent & Skill System');
  console.log('='.repeat(60));

  // Test 1: Get all global agents
  console.log('\n[TEST 1] Get Global Agents');
  console.log('-'.repeat(40));
  const globalAgents = agentManager.getGlobalAgents();
  console.log(`Found ${globalAgents.length} global agents:`);
  globalAgents.forEach(agent => {
    console.log(`  - ${agent.id}: ${agent.name} (${agent.role})`);
    console.log(`    Category: ${agent.category}`);
    console.log(`    Skills: ${agent.defaultSkills?.join(', ') || 'none'}`);
  });

  // Test 2: Verify 4 agent roles
  console.log('\n[TEST 2] Verify 4 Agent Roles');
  console.log('-'.repeat(40));
  const expectedAgents = ['ui-designer', 'frontend-developer', 'backend-developer', 'analyst'];
  const foundAgents = expectedAgents.filter(id => agentManager.getGlobalAgent(id));
  console.log(`Expected: ${expectedAgents.join(', ')}`);
  console.log(`Found: ${foundAgents.join(', ')}`);
  console.log(`Status: ${foundAgents.length === expectedAgents.length ? 'PASS' : 'FAIL'}`);

  // Test 3: Load global skills
  console.log('\n[TEST 3] Load Global Skills');
  console.log('-'.repeat(40));
  const globalSkills = await skillManager.loadGlobalSkills();
  console.log(`Found ${globalSkills.length} global skills:`);
  globalSkills.forEach(skill => {
    console.log(`  - ${skill.id}: ${skill.name}`);
    console.log(`    Tags: ${skill.tags?.join(', ') || 'none'}`);
  });

  // Test 4: Load skill templates
  console.log('\n[TEST 4] Load Skill Templates');
  console.log('-'.repeat(40));
  const templates = await skillManager.loadTemplates();
  console.log(`Found ${templates.length} skill templates:`);
  templates.forEach(template => {
    console.log(`  - ${template.id}: ${template.name}`);
    console.log(`    Project types: ${template.projectTypes?.join(', ') || 'any'}`);
    console.log(`    Tags: ${template.tags?.join(', ') || 'none'}`);
  });

  // Test 5: Workspace detection (using current project)
  console.log('\n[TEST 5] Workspace Detection');
  console.log('-'.repeat(40));
  const projectRoot = path.join(__dirname, '..', '..', '..');
  console.log(`Testing with workspace: ${projectRoot}`);
  const detection = await skillManager.detectProjectType(projectRoot);
  console.log(`Detected project types: ${detection.projectTypes.join(', ') || 'none'}`);
  console.log(`Suggestions: ${detection.suggestions.length}`);
  detection.suggestions.forEach(s => {
    console.log(`  - ${s.template.name} (${(s.confidence * 100).toFixed(0)}% confidence)`);
    console.log(`    Reason: ${s.reason}`);
  });

  // Test 6: Get all agents for user
  console.log('\n[TEST 6] Get All Agents for User');
  console.log('-'.repeat(40));
  const testUserId = 'test-user-123';
  const userAgents = await agentManager.getUserAgents(testUserId);
  console.log(`Total agents available for ${testUserId}: ${userAgents.length}`);
  userAgents.forEach(agent => {
    const type = agent.isGlobal ? 'Global' : 'Custom';
    console.log(`  - [${type}] ${agent.id}: ${agent.name}`);
  });

  // Test 7: Get available skills for user
  console.log('\n[TEST 7] Get Available Skills for User');
  console.log('-'.repeat(40));
  const availableSkills = await skillManager.getUserAvailableSkills(testUserId);
  console.log(`Global skills: ${availableSkills.global.length}`);
  console.log(`Custom skills: ${availableSkills.custom.length}`);
  console.log(`Total: ${availableSkills.all.length}`);

  // Test 8: Agent-skill mapping verification
  console.log('\n[TEST 8] Agent-Skill Mapping');
  console.log('-'.repeat(40));
  const agentSkillMap = {
    'ui-designer': ['design-principles', 'ux-patterns', 'accessibility-standards'],
    'frontend-developer': ['frontend-architecture', 'component-patterns', 'frontend-performance'],
    'backend-developer': ['api-design-principles', 'database-patterns', 'backend-security'],
    'analyst': ['data-analysis-methodology', 'statistical-foundations', 'data-visualization-principles']
  };

  let totalExpected = 0;
  let totalFound = 0;

  for (const [agentId, expectedSkills] of Object.entries(agentSkillMap)) {
    const agent = agentManager.getGlobalAgent(agentId);
    if (agent) {
      const matchingSkills = expectedSkills.filter(skillId =>
        globalSkills.some(s => s.id === skillId)
      );
      const missingSkills = expectedSkills.filter(skillId =>
        !globalSkills.some(s => s.id === skillId)
      );

      totalExpected += expectedSkills.length;
      totalFound += matchingSkills.length;

      console.log(`  ${agent.name}:`);
      console.log(`    Expected: ${expectedSkills.join(', ')}`);
      console.log(`    Found: ${matchingSkills.length}/${expectedSkills.length}`);
      if (missingSkills.length > 0) {
        console.log(`    Missing: ${missingSkills.join(', ')}`);
      }
    }
  }

  console.log(`\n  Overall: ${totalFound}/${totalExpected} skills found`);
  console.log(`  Status: ${totalFound === totalExpected ? 'PASS' : 'FAIL'}`);

  // Test 9: Template-project type mapping
  console.log('\n[TEST 9] Template-Project Type Mapping');
  console.log('-'.repeat(40));
  const projectTypes = ['react', 'node', 'python'];
  for (const projectType of projectTypes) {
    const templatesForType = await skillManager.getTemplatesForProjectType(projectType);
    console.log(`  ${projectType}: ${templatesForType.map(t => t.id).join(', ') || 'none'}`);
  }

  // Test 10: Search skills
  console.log('\n[TEST 10] Search Skills');
  console.log('-'.repeat(40));
  const searchTerms = ['design', 'api', 'data'];
  for (const term of searchTerms) {
    const results = await skillManager.searchSkills(testUserId, term);
    console.log(`  "${term}": ${results.length} results`);
    results.slice(0, 2).forEach(r => console.log(`    - ${r.name}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Complete!');
  console.log('='.repeat(60));
}

// Run tests
testAgentSystem().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
