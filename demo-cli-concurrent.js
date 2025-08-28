/**
 * 简单演示：多个 Claude CLI 并发运行
 * 这个脚本直接展示多个 CLI 进程同时工作
 */

import { spawn } from 'child_process';

// 不同颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// 测试消息
const messages = [
  "What is 2 + 2?",
  "What's the capital of France?",
  "Say hello in Spanish",
  "What color is the sky?"
];

// 运行单个 Claude CLI 实例
function runClaudeInstance(id, message) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.cyan}[CLI-${id}]${colors.reset} Starting...`);
    
    const startTime = Date.now();
    const claude = spawn('claude', [], {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';
    
    // 收集输出
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    // 发送消息
    setTimeout(() => {
      console.log(`${colors.yellow}[CLI-${id}]${colors.reset} Sending: "${message}"`);
      claude.stdin.write(message + '\n');
      claude.stdin.end();
    }, 1000);

    // 处理结束
    claude.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      if (code === 0 || output.length > 0) {
        // 清理输出
        const response = output
          .replace(/^>+\s*/gm, '')
          .replace(/Human:.*$/s, '')
          .trim()
          .substring(0, 100);
        
        console.log(`${colors.green}[CLI-${id}]${colors.reset} Response (${duration}ms): "${response}..."`);
        resolve({ id, message, response, duration });
      } else {
        console.log(`${colors.red}[CLI-${id}]${colors.reset} Failed: ${errorOutput}`);
        reject(new Error(`CLI-${id} failed`));
      }
    });

    // 超时处理
    setTimeout(() => {
      claude.kill();
      reject(new Error(`CLI-${id} timeout`));
    }, 30000);
  });
}

async function demonstrateConcurrency() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          Claude CLI 多实例并发演示                         ║
╠════════════════════════════════════════════════════════════╣
║  演示多个 Claude CLI 进程同时运行，各自处理不同的请求        ║
╚════════════════════════════════════════════════════════════╝
`);

  console.log('🚀 启动 4 个 Claude CLI 实例并发处理...\n');
  
  const startTime = Date.now();
  
  // 并发运行多个 CLI 实例
  const promises = messages.map((msg, index) => 
    runClaudeInstance(index + 1, msg).catch(err => ({
      id: index + 1,
      error: err.message
    }))
  );
  
  console.log('⏳ 所有实例正在并行处理...\n');
  
  // 等待所有实例完成
  const results = await Promise.all(promises);
  const totalDuration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 结果汇总:');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => !r.error);
  console.log(`✅ 成功: ${successful.length}/${results.length}`);
  console.log(`⏱️  总用时: ${totalDuration}ms`);
  console.log(`🚀 平均用时: ${(totalDuration / results.length).toFixed(2)}ms`);
  
  console.log('\n💡 关键观察:');
  console.log('  • 多个 CLI 实例同时运行，互不干扰');
  console.log('  • 每个实例独立处理自己的请求');
  console.log('  • 总时间 ≈ 最慢单个请求的时间（并行效果）');
  console.log('  • 如果串行处理，总时间会是所有请求时间之和');
  
  // 计算理论串行时间
  const serialTime = successful.reduce((sum, r) => sum + r.duration, 0);
  console.log(`\n📈 性能提升: ${(serialTime / totalDuration).toFixed(2)}倍`);
  console.log(`   串行时间: ${serialTime}ms`);
  console.log(`   并行时间: ${totalDuration}ms`);
}

// 简化版本：展示基本原理
async function simpleDemo() {
  console.log('\n📝 简化演示：两个 CLI 同时工作\n');
  
  // 启动两个 CLI 进程
  console.log('启动 CLI-A 和 CLI-B...');
  
  const cliA = spawn('echo', ['CLI-A: 处理任务A'], { shell: true });
  const cliB = spawn('echo', ['CLI-B: 处理任务B'], { shell: true });
  
  cliA.stdout.on('data', (data) => {
    console.log(`${colors.blue}${data.toString().trim()}${colors.reset}`);
  });
  
  cliB.stdout.on('data', (data) => {
    console.log(`${colors.green}${data.toString().trim()}${colors.reset}`);
  });
  
  // 等待完成
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n✅ 两个 CLI 实例同时完成了各自的任务！');
}

// 主函数
async function main() {
  try {
    // 先运行简单演示
    await simpleDemo();
    
    // 检查 Claude CLI 是否可用
    console.log('\n检查 Claude CLI...');
    const { execSync } = await import('child_process');
    
    try {
      execSync('claude --version', { stdio: 'ignore' });
      console.log('✅ Claude CLI 已安装\n');
      
      // 运行完整演示
      await demonstrateConcurrency();
    } catch (error) {
      console.log('⚠️  Claude CLI 未安装或未登录');
      console.log('\n模拟演示结果:');
      console.log('  如果 Claude CLI 已登录，将会:');
      console.log('  • 同时启动 4 个 CLI 进程');
      console.log('  • 每个进程处理不同的问题');
      console.log('  • 并行处理，大幅缩短总时间');
    }
  } catch (error) {
    console.error('错误:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}