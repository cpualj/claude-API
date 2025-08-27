#!/usr/bin/env python3
"""
Claude CLI Wrapper
用于在 Docker 容器中模拟 Claude CLI 的行为
"""

import os
import sys
import json
import asyncio
from typing import Optional
import anthropic
from anthropic import Anthropic, AsyncAnthropic

class ClaudeWrapper:
    def __init__(self):
        # 从环境变量获取 API Key
        self.api_key = os.environ.get('CLAUDE_API_KEY') or os.environ.get('ANTHROPIC_API_KEY')
        
        if not self.api_key:
            print("Error: No API key found. Please set CLAUDE_API_KEY or ANTHROPIC_API_KEY", file=sys.stderr)
            sys.exit(1)
        
        # 初始化客户端
        self.client = Anthropic(api_key=self.api_key)
        self.model = os.environ.get('CLAUDE_MODEL', 'claude-3-sonnet-20240229')
        self.max_tokens = int(os.environ.get('MAX_TOKENS', '4096'))
        
        # 会话上下文
        self.conversation_history = []
        self.session_file = os.path.join(os.environ.get('CLAUDE_SESSION_DIR', '/app/sessions'), 'current_session.json')
        
        # 加载已有会话
        self.load_session()
    
    def load_session(self):
        """加载之前的会话历史"""
        if os.path.exists(self.session_file):
            try:
                with open(self.session_file, 'r') as f:
                    self.conversation_history = json.load(f)
            except:
                self.conversation_history = []
    
    def save_session(self):
        """保存会话历史"""
        os.makedirs(os.path.dirname(self.session_file), exist_ok=True)
        with open(self.session_file, 'w') as f:
            json.dump(self.conversation_history, f)
    
    def chat(self, message: str, stream: bool = False):
        """发送消息到 Claude API"""
        try:
            # 添加用户消息到历史
            self.conversation_history.append({
                "role": "user",
                "content": message
            })
            
            # 准备消息
            messages = self.conversation_history[-10:]  # 保留最近10条消息作为上下文
            
            if stream:
                # 流式响应
                with self.client.messages.stream(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    messages=messages
                ) as stream:
                    response_text = ""
                    for text in stream.text_stream:
                        print(text, end='', flush=True)
                        response_text += text
                    
                    # 添加助手响应到历史
                    self.conversation_history.append({
                        "role": "assistant",
                        "content": response_text
                    })
            else:
                # 普通响应
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=self.max_tokens,
                    messages=messages
                )
                
                response_text = response.content[0].text
                print(response_text)
                
                # 添加助手响应到历史
                self.conversation_history.append({
                    "role": "assistant",
                    "content": response_text
                })
            
            # 保存会话
            self.save_session()
            
        except Exception as e:
            print(f"Error: {str(e)}", file=sys.stderr)
            sys.exit(1)
    
    def handle_command(self, args):
        """处理命令行参数"""
        if '--help' in args or '-h' in args:
            self.print_help()
            return
        
        if '--version' in args or '-v' in args:
            print("Claude CLI Wrapper v1.0.0")
            return
        
        if '--clear' in args:
            self.conversation_history = []
            self.save_session()
            print("Session cleared")
            return
        
        if '--continue' in args or '--resume' in args:
            # 继续之前的会话
            if self.conversation_history:
                print("Resuming previous conversation...")
                for msg in self.conversation_history[-2:]:
                    role = "You" if msg['role'] == 'user' else "Claude"
                    print(f"{role}: {msg['content'][:100]}...")
            else:
                print("No previous conversation found")
            return
        
        # 检查是否是流式模式
        stream = '--stream' in args
        if stream:
            args.remove('--stream')
        
        # 从标准输入读取消息
        if not sys.stdin.isatty():
            message = sys.stdin.read().strip()
        elif args:
            # 从命令行参数获取消息
            message = ' '.join(args)
        else:
            # 交互模式
            print("Enter your message (Ctrl+D to send):")
            message = sys.stdin.read().strip()
        
        if message:
            self.chat(message, stream=stream)
    
    def print_help(self):
        """打印帮助信息"""
        help_text = """
Claude CLI Wrapper - Docker Version

Usage:
  claude [options] [message]

Options:
  --stream          Enable streaming mode
  --continue        Resume previous conversation
  --clear           Clear conversation history
  --version         Show version
  --help            Show this help

Examples:
  claude "Hello, Claude!"
  echo "What is Python?" | claude
  claude --stream "Write a long story"
  claude --continue

Environment Variables:
  CLAUDE_API_KEY    Your Anthropic API key
  CLAUDE_MODEL      Model to use (default: claude-3-sonnet-20240229)
  MAX_TOKENS        Maximum tokens (default: 4096)
"""
        print(help_text)

def main():
    wrapper = ClaudeWrapper()
    wrapper.handle_command(sys.argv[1:])

if __name__ == '__main__':
    main()