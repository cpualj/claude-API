#!/usr/bin/env node

/**
 * Test Setup Verification Script
 * Checks if all test dependencies and environment are properly configured
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Claude API Backend - Test Setup Verification\n');

const checks = [
  {
    name: 'Node.js Version',
    check: () => {
      const version = process.version;
      const majorVersion = parseInt(version.slice(1).split('.')[0]);
      if (majorVersion >= 18) {
        return { success: true, message: `✅ Node.js ${version}` };
      } else {
        return { success: false, message: `❌ Node.js ${version} (requires 18+)` };
      }
    }
  },
  {
    name: 'Package Dependencies',
    check: () => {
      try {
        const packageJson = JSON.parse(
          execSync('cat package.json', { encoding: 'utf8' })
        );
        
        const requiredDeps = ['vitest', 'supertest', '@vitest/ui'];
        const missing = requiredDeps.filter(dep => 
          !packageJson.devDependencies?.[dep] && !packageJson.dependencies?.[dep]
        );
        
        if (missing.length === 0) {
          return { success: true, message: '✅ All test dependencies installed' };
        } else {
          return { 
            success: false, 
            message: `❌ Missing dependencies: ${missing.join(', ')}` 
          };
        }
      } catch (error) {
        return { success: false, message: '❌ Could not read package.json' };
      }
    }
  },
  {
    name: 'Vitest Configuration',
    check: () => {
      if (existsSync(join(__dirname, 'vitest.config.js'))) {
        return { success: true, message: '✅ vitest.config.js found' };
      } else {
        return { success: false, message: '❌ vitest.config.js missing' };
      }
    }
  },
  {
    name: 'Test Directory Structure',
    check: () => {
      const testDirs = [
        'tests',
        'tests/db',
        'tests/services', 
        'tests/routes'
      ];
      
      const missing = testDirs.filter(dir => 
        !existsSync(join(__dirname, dir))
      );
      
      if (missing.length === 0) {
        return { success: true, message: '✅ Test directory structure complete' };
      } else {
        return { 
          success: false, 
          message: `❌ Missing directories: ${missing.join(', ')}` 
        };
      }
    }
  },
  {
    name: 'Test Files',
    check: () => {
      const testFiles = [
        'tests/setup.js',
        'tests/db/init.test.js',
        'tests/services/redis.test.js',
        'tests/services/workerManager.test.js',
        'tests/services/apiKeyManager.test.js',
        'tests/services/sessionManager.test.js',
        'tests/routes/auth.test.js',
        'tests/routes/api.test.js',
        'tests/routes/admin.test.js',
        'tests/routes/health.test.js'
      ];
      
      const missing = testFiles.filter(file => 
        !existsSync(join(__dirname, file))
      );
      
      if (missing.length === 0) {
        return { success: true, message: '✅ All test files present' };
      } else {
        return { 
          success: false, 
          message: `❌ Missing test files: ${missing.length} files` 
        };
      }
    }
  },
  {
    name: 'Environment Configuration',
    check: () => {
      if (existsSync(join(__dirname, '.env.test'))) {
        return { success: true, message: '✅ .env.test configuration found' };
      } else {
        return { success: false, message: '❌ .env.test configuration missing' };
      }
    }
  },
  {
    name: 'PostgreSQL Availability',
    check: () => {
      try {
        execSync('which psql', { stdio: 'ignore' });
        return { success: true, message: '✅ PostgreSQL client available' };
      } catch (error) {
        return { 
          success: false, 
          message: '⚠️  PostgreSQL client not found (tests may fail)' 
        };
      }
    }
  },
  {
    name: 'Test Database',
    check: () => {
      try {
        execSync('psql -lqt | cut -d \\| -f 1 | grep -qw claude_api_test', { stdio: 'ignore' });
        return { success: true, message: '✅ Test database exists' };
      } catch (error) {
        return { 
          success: false, 
          message: '⚠️  Test database not found (will be created during tests)' 
        };
      }
    }
  }
];

console.log('Running setup checks...\n');

let allPassed = true;
let warnings = 0;

for (const { name, check } of checks) {
  try {
    const result = check();
    console.log(`${name}: ${result.message}`);
    
    if (!result.success) {
      if (result.message.includes('⚠️')) {
        warnings++;
      } else {
        allPassed = false;
      }
    }
  } catch (error) {
    console.log(`${name}: ❌ Check failed - ${error.message}`);
    allPassed = false;
  }
}

console.log('\n' + '='.repeat(50));

if (allPassed) {
  console.log('🎉 All checks passed! Test environment is ready.');
  
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} warning(s) - tests should still work`);
  }
  
  console.log('\nNext steps:');
  console.log('1. Install dependencies: npm install');
  console.log('2. Run tests: npm test');
  console.log('3. View coverage: npm run test:coverage');
  console.log('4. Open test UI: npm run test:ui');
  
  process.exit(0);
} else {
  console.log('❌ Some checks failed. Please fix the issues above before running tests.');
  
  console.log('\nQuick fixes:');
  console.log('• Install dependencies: npm install');
  console.log('• Create test database: createdb claude_api_test');
  console.log('• Check PostgreSQL is running: pg_ctl status');
  
  process.exit(1);
}