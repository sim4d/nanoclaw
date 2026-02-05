"""
Add-Parallel Skill 示例代码
并行处理多个任务的实用示例
"""

import asyncio
import time
from typing import List, Dict, Any


# ============ 示例 1：基础并行任务 ============

async def parallel_search(topics: List[str]) -> Dict[str, str]:
    """
    并行搜索多个主题

    Args:
        topics: 搜索主题列表

    Returns:
        每个主题的搜索结果
    """
    async def search_topic(topic: str) -> tuple:
        """模拟搜索一个主题"""
        await asyncio.sleep(1)  # 模拟网络请求
        return (topic, f"关于 {topic} 的搜索结果...")

    # 并行执行所有搜索
    tasks = [search_topic(topic) for topic in topics]
    results = await asyncio.gather(*tasks)

    return dict(results)


# ============ 示例 2：并行文件处理 ============

async def process_files_parallel(file_paths: List[str]) -> List[Dict[str, Any]]:
    """
    并行处理多个文件

    Args:
        file_paths: 文件路径列表

    Returns:
        处理结果列表
    """
    async def process_file(file_path: str) -> Dict[str, Any]:
        """处理单个文件"""
        await asyncio.sleep(0.5)  # 模拟文件读取
        return {
            'file': file_path,
            'size': 1024,
            'status': 'success',
            'lines': 100
        }

    # 并行处理所有文件
    tasks = [process_file(fp) for fp in file_paths]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 处理异常
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed_results.append({
                'file': file_paths[i],
                'status': 'error',
                'error': str(result)
            })
        else:
            processed_results.append(result)

    return processed_results


# ============ 示例 3：并行 API 调用 ============

async def fetch_multiple_apis(api_endpoints: List[str]) -> Dict[str, Any]:
    """
    并行调用多个 API

    Args:
        api_endpoints: API 端点列表

    Returns:
        所有 API 的响应数据
    """
    async def fetch_api(endpoint: str) -> tuple:
        """调用单个 API"""
        await asyncio.sleep(0.8)  # 模拟网络延迟
        # 模拟 API 响应
        return (endpoint, {'data': f'Response from {endpoint}', 'status': 200})

    # 并行调用所有 API
    tasks = [fetch_api(endpoint) for endpoint in api_endpoints]
    responses = await asyncio.gather(*tasks)

    return dict(responses)


# ============ 示例 4：带限流的并行任务 ============

class ParallelTaskExecutor:
    """带限流的并行任务执行器"""

    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)

    async def execute_tasks(self, tasks: List[Any]) -> List[Any]:
        """
        执行多个任务，限制并发数

        Args:
            tasks: 任务列表

        Returns:
            执行结果列表
        """
        async def limited_task(task):
            """带并发限制的任务"""
            async with self.semaphore:
                return await task

        results = await asyncio.gather(*[limited_task(t) for t in tasks])
        return results


# ============ 示例 5：并行数据转换 ============

async def transform_data_parallel(data_items: List[Dict]) -> List[Dict]:
    """
    并行转换多个数据项

    Args:
        data_items: 原始数据列表

    Returns:
        转换后的数据列表
    """
    async def transform_item(item: Dict) -> Dict:
        """转换单个数据项"""
        await asyncio.sleep(0.2)  # 模拟转换过程
        return {
            **item,
            'processed': True,
            'timestamp': time.time()
        }

    tasks = [transform_item(item) for item in data_items]
    results = await asyncio.gather(*tasks)

    return results


# ============ 示例 6：并行子代理系统 ============

class SubAgent:
    """子代理基类"""

    def __init__(self, name: str, specialty: str):
        self.name = name
        self.specialty = specialty

    async def process(self, task: str) -> Dict:
        """处理任务"""
        await asyncio.sleep(1)  # 模拟处理时间
        return {
            'agent': self.name,
            'specialty': self.specialty,
            'task': task,
            'result': f'{self.name} 完成了 {task}'
        }


class ParallelAgentSystem:
    """并行代理系统"""

    def __init__(self):
        # 创建专门化的子代理
        self.agents = {
            'frontend': SubAgent('前端代理', 'UI/UX 开发'),
            'backend': SubAgent('后端代理', 'API 和服务器'),
            'database': SubAgent('数据库代理', '数据建模'),
            'testing': SubAgent('测试代理', '质量保证'),
            'documentation': SubAgent('文档代理', '文档编写')
        }

    async def execute_parallel_development(self, project_description: str) -> Dict[str, Any]:
        """
        并行执行项目开发

        Args:
            project_description: 项目描述

        Returns:
            各子代理的执行结果
        """
        # 分解任务
        tasks = {
            'frontend': f'设计 {project_description} 的用户界面',
            'backend': f'开发 {project_description} 的 API',
            'database': f'设计 {project_description} 的数据库',
            'testing': f'编写 {project_description} 的测试',
            'documentation': f'编写 {project_description} 的文档'
        }

        # 并行执行
        async def run_agent(agent_type, task):
            return await self.agents[agent_type].process(task)

        results = await asyncio.gather(*[
            run_agent(agent_type, task)
            for agent_type, task in tasks.items()
        ])

        # 整理结果
        return {
            agent_type: result
            for agent_type, result in zip(tasks.keys(), results)
        }


# ============ 测试代码 ============

async def main():
    """测试所有示例"""
    print("=" * 60)
    print("Add-Parallel Skill 示例测试")
    print("=" * 60)

    # 示例 1：并行搜索
    print("\n1. 并行搜索示例")
    start = time.time()
    results = await parallel_search(['Python', 'JavaScript', 'Go'])
    print(f"结果: {results}")
    print(f"耗时: {time.time() - start:.2f} 秒")

    # 示例 2：并行文件处理
    print("\n2. 并行文件处理示例")
    files = ['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt']
    start = time.time()
    file_results = await process_files_parallel(files)
    print(f"处理了 {len(file_results)} 个文件")
    print(f"耗时: {time.time() - start:.2f} 秒")

    # 示例 3：并行 API 调用
    print("\n3. 并行 API 调用示例")
    apis = ['/api/users', '/api/posts', '/api/comments']
    start = time.time()
    api_results = await fetch_multiple_apis(apis)
    print(f"调用了 {len(api_results)} 个 API")
    print(f"耗时: {time.time() - start:.2f} 秒")

    # 示例 6：并行子代理系统
    print("\n4. 并行子代理系统示例")
    system = ParallelAgentSystem()
    start = time.time()
    agent_results = await system.execute_parallel_development('待办事项应用')
    for agent_type, result in agent_results.items():
        print(f"{result['agent']}: {result['result']}")
    print(f"总耗时: {time.time() - start:.2f} 秒")

    print("\n✅ 所有测试完成！")


if __name__ == "__main__":
    asyncio.run(main())
