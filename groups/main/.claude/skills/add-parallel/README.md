# Add-Parallel Skill 示例和实现

这个目录包含 add-parallel skill 的示例和实现代码。

## 目录结构

```
add-parallel/
├── SKILL.md              # Skill 定义
├── README.md            # 本文件
├── examples/            # 示例代码
└── utils/               # 工具函数
```

## 示例

### 1. 并行信息收集

```python
import asyncio

async def parallel_research(topics):
    """并行研究多个主题"""
    tasks = [
        search_web(topic),
        analyze_results(topic),
        summarize_findings(topic)
        for topic in topics
    ]
    results = await asyncio.gather(*tasks)
    return results
```

### 2. 并行代码生成

```python
async def generate_project_components():
    """并行生成项目组件"""
    tasks = [
        generate_frontend(),
        generate_backend(),
        generate_database(),
        generate_tests()
    ]
    components = await asyncio.gather(*tasks)
    return components
```

### 3. 子代理协作

```python
class ParallelAgentSystem:
    """并行代理系统"""

    def __init__(self):
        self.agents = {
            'frontend': FrontendAgent(),
            'backend': BackendAgent(),
            'database': DatabaseAgent(),
            'testing': TestAgent()
        }

    async def run_parallel_task(self, task_description):
        """并行运行任务"""
        subtasks = self.breakdown_task(task_description)
        results = await asyncio.gather(*[
            self.agents[agent_type].process(subtask)
            for agent_type, subtask in subtasks.items()
        ])
        return self.merge_results(results)
```

## 实现原则

1. **任务分解** - 将大任务拆分为小任务
2. **独立性** - 确保任务相互独立
3. **并发执行** - 使用异步或多线程
4. **结果合并** - 汇总所有结果
5. **错误处理** - 优雅处理失败

## 性能考虑

- 使用异步 I/O 进行网络操作
- 使用进程池进行 CPU 密集型任务
- 限制并发数量避免资源耗尽
- 使用超时机制避免阻塞
