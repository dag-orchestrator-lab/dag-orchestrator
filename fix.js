const fs = require('fs');
const content = fs.readFileSync('src/infrastructure/orchestration/agents/planner-agent.ts', 'utf8');
const fixed = content.replace(/this\.publishStageComplete\(\(\{\n      role: this\.role,\n      workspaceSlug: context\.workspaceSlug,\n      artifactPath,\n      timestamp: new Date\(\)\.toISOString\(\),\n    \} as unknown as any\)\n      stageName,\n    \}\);/, 
  'this.publishStageComplete({\n      role: this.role,\n      workspaceSlug: context.workspaceSlug,\n      artifactPath,\n      timestamp: new Date().toISOString(),\n      stageName\n    } as any);');
fs.writeFileSync('src/infrastructure/orchestration/agents/planner-agent.ts', fixed);
