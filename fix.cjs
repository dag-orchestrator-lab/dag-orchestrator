const fs = require('fs');
let code = fs.readFileSync('bin/dag.js', 'utf8');

// 1. Delete the rogue bracket at line 1217
code = code.replace(/    \}\n  \}\n\}\n\nasync function runStep4\(\) \{/, '    }\n  }\n\nasync function runStep4() {');

// 2. Extract currentStatus out of the if block
code = code.replace(
  /  const isAllConforming = [^\n]+\n  if \(isAllConforming\) \{\n    const currentStatus = getPipelineStatus\(process.cwd\(\)\);\n    const pct =/,
  '  const currentStatus = getPipelineStatus(process.cwd());\n  const isAllConforming = !/drift detected|fail/i.test(conformanceReport) || /all active tasks in diff conform/i.test(conformanceReport);\n  if (isAllConforming) {\n    const pct ='
);

fs.writeFileSync('bin/dag.js', code);
