# Antigravity Skill for Andy

为 AI 助手 Andy 添加 Google Antigravity 风格的编程能力。

## 安装位置

```
/workspace/group/.claude/skills/antigravity/
```

## 包含文件

- `SKILL.md` - Skill 定义文件
- `README.md` - 本文件
- `examples/` - 代码示例

## 功能特性

### 🎯 核心能力
1. **智能代码生成**
2. **代码分析与优化**
3. **智能调试**
4. **代码解释**
5. **代码重构**
6. **测试生成**

### 💻 支持语言
Python, JavaScript/TypeScript, Java, Go, Rust, C/C++, Ruby, PHP, Swift, Kotlin 等

### 🔄 工作流
- 对话式编程
- 多轮迭代
- 需求理解
- 代码生成
- 质量保证

## 使用示例

### 示例 1：快速创建功能
```
你：帮我创建一个文件上传 API

Andy：好的，我来帮你创建一个文件上传 API。
使用什么技术栈？
- Python Flask
- Node.js Express
- Go Gin
```

### 示例 2：代码调试
```
你：这段代码有内存泄漏，帮我看看：
[代码]

Andy：让我分析一下...
发现几个潜在问题：
1. 未关闭的文件句柄
2. 事件监听器未移除
3. 定时器未清理

修复方案：
[修复后的代码]
```

### 示例 3：性能优化
```
你：这个查询很慢，怎么优化？
[SQL 代码]

Andy：分析性能瓶颈...
优化建议：
1. 添加索引
2. 重写查询结构
3. 使用缓存

优化后的代码：
[优化后的代码]
```

## 与 Antigravity 的对应关系

| Google Antigravity | Andy Skill |
|-------------------|------------|
| AI Chat | 对话式编程 |
| Code Generation | 智能代码生成 |
| Code Analysis | 代码分析优化 |
| Debug Assistant | 智能调试 |
| Multi-file Editing | 多文件操作 |
| Terminal Integration | 命令执行 |

## 额外优势

与 Google Antigravity 相比，Andy 还具备：
- 🌐 网页浏览和截图能力
- 📰 新闻资讯获取
- ⏰ 定时任务管理
- 💾 文件系统操作
- 🔍 网络搜索

## 配置建议

可以在对话中自定义：
- 编程语言偏好
- 代码风格规范
- 注释语言偏好
- 错误处理策略

## 限制说明

此 skill 在当前环境中运行，因此：
- ✅ 可以生成和保存代码文件
- ✅ 可以执行某些脚本（Node.js, Python）
- ⚠️ 无法直接访问你的本地开发环境
- ⚠️ 需要通过文件传输来整合到你的项目中

## 最佳实践

1. **明确需求**：在开始前详细描述功能需求
2. **提供上下文**：分享相关代码和项目结构
3. **逐步构建**：复杂功能分步骤实现
4. **测试验证**：生成代码后进行测试
5. **迭代优化**：根据反馈持续改进

---

*Created by Andy - Your AI Assistant*
