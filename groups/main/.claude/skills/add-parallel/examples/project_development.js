/**
 * Add-Parallel Skill 示例 - Node.js 版本
 * 并行项目开发示例
 */

const { promisify } = require('util');
const sleep = promisify(setTimeout);


// ============ 示例 1：并行搜索 ============

async function parallelSearch(topics) {
    /**
     * 并行搜索多个主题
     * @param {string[]} topics - 搜索主题列表
     * @returns {Object} 搜索结果
     */
    const searchPromises = topics.map(async (topic) => {
        await sleep(1000); // 模拟网络请求
        return [topic, `关于 ${topic} 的搜索结果...`];
    });

    const results = await Promise.all(searchPromises);
    return Object.fromEntries(results);
}


// ============ 示例 2：并行文件处理 ============

async function processFilesParallel(filePaths) {
    /**
     * 并行处理多个文件
     * @param {string[]} filePaths - 文件路径列表
     * @returns {Array} 处理结果
     */
    const processPromises = filePaths.map(async (filePath) => {
        try {
            await sleep(500); // 模拟文件读取
            return {
                file: filePath,
                size: 1024,
                status: 'success',
                lines: 100
            };
        } catch (error) {
            return {
                file: filePath,
                status: 'error',
                error: error.message
            };
        }
    });

    return await Promise.all(processPromises);
}


// ============ 示例 3：并行 API 调用 ============

async function fetchMultipleAPIs(apiEndpoints) {
    /**
     * 并行调用多个 API
     * @param {string[]} apiEndpoints - API 端点列表
     * @returns {Object} API 响应数据
     */
    const fetchPromises = apiEndpoints.map(async (endpoint) => {
        await sleep(800); // 模拟网络延迟
        return [
            endpoint,
            { data: `Response from ${endpoint}`, status: 200 }
        ];
    });

    const responses = await Promise.all(fetchPromises);
    return Object.fromEntries(responses);
}


// ============ 示例 4：带限流的并行任务 ============

class ParallelTaskExecutor {
    /**
     * 带限流的并行任务执行器
     * @param {number} maxConcurrent - 最大并发数
     */
    constructor(maxConcurrent = 5) {
        this.maxConcurrent = maxConcurrent;
        this.running = 0;
        this.queue = [];
    }

    async execute(tasks) {
        /**
         * 执行多个任务，限制并发数
         * @param {Function[]} tasks - 任务列表
         * @returns {Array} 执行结果
         */
        const results = [];

        for (const task of tasks) {
            // 等待可用槽位
            while (this.running >= this.maxConcurrent) {
                await sleep(10);
            }

            this.running++;
            task()
                .then(result => {
                    results.push(result);
                })
                .catch(error => {
                    results.push({ error: error.message });
                })
                .finally(() => {
                    this.running--;
                });
        }

        // 等待所有任务完成
        while (this.running > 0) {
            await sleep(10);
        }

        return results;
    }
}


// ============ 示例 5：并行项目生成 ============

class SubAgent {
    /**
     * 子代理类
     * @param {string} name - 代理名称
     * @param {string} specialty - 专业领域
     */
    constructor(name, specialty) {
        this.name = name;
        this.specialty = specialty;
    }

    async process(task) {
        /**
         * 处理任务
         * @param {string} task - 任务描述
         * @returns {Object} 处理结果
         */
        await sleep(1000); // 模拟处理时间
        return {
            agent: this.name,
            specialty: this.specialty,
            task: task,
            result: `${this.name} 完成了 ${task}`
        };
    }
}


class ParallelAgentSystem {
    /**
     * 并行代理系统
     */
    constructor() {
        // 创建专门化的子代理
        this.agents = {
            frontend: new SubAgent('前端代理', 'UI/UX 开发'),
            backend: new SubAgent('后端代理', 'API 和服务器'),
            database: new SubAgent('数据库代理', '数据建模'),
            testing: new SubAgent('测试代理', '质量保证'),
            documentation: new SubAgent('文档代理', '文档编写')
        };
    }

    async executeParallelDevelopment(projectDescription) {
        /**
         * 并行执行项目开发
         * @param {string} projectDescription - 项目描述
         * @returns {Object} 各子代理的执行结果
         */
        // 分解任务
        const tasks = {
            frontend: `设计 ${projectDescription} 的用户界面`,
            backend: `开发 ${projectDescription} 的 API`,
            database: `设计 ${projectDescription} 的数据库`,
            testing: `编写 ${projectDescription} 的测试`,
            documentation: `编写 ${projectDescription} 的文档`
        };

        // 并行执行
        const agentPromises = Object.entries(tasks).map(
            async ([agentType, task]) => {
                const result = await this.agents[agentType].process(task);
                return [agentType, result];
            }
        );

        const results = await Promise.all(agentPromises);
        return Object.fromEntries(results);
    }
}


// ============ 示例 6：并行数据转换 ============

async function transformDataParallel(dataItems) {
    /**
     * 并行转换多个数据项
     * @param {Array} dataItems - 原始数据列表
     * @returns {Array} 转换后的数据列表
     */
    const transformPromises = dataItems.map(async (item) => {
        await sleep(200); // 模拟转换过程
        return {
            ...item,
            processed: true,
            timestamp: Date.now()
        };
    });

    return await Promise.all(transformPromises);
}


// ============ 测试代码 ============

async function main() {
    console.log('='.repeat(60));
    console.log('Add-Parallel Skill 示例测试 (Node.js)');
    console.log('='.repeat(60));

    // 示例 1：并行搜索
    console.log('\n1. 并行搜索示例');
    let start = Date.now();
    const searchResults = await parallelSearch(['Python', 'JavaScript', 'Go']);
    console.log('结果:', searchResults);
    console.log(`耗时: ${(Date.now() - start) / 1000} 秒`);

    // 示例 2：并行文件处理
    console.log('\n2. 并行文件处理示例');
    const files = ['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt'];
    start = Date.now();
    const fileResults = await processFilesParallel(files);
    console.log(`处理了 ${fileResults.length} 个文件`);
    console.log(`耗时: ${(Date.now() - start) / 1000} 秒`);

    // 示例 3：并行 API 调用
    console.log('\n3. 并行 API 调用示例');
    const apis = ['/api/users', '/api/posts', '/api/comments'];
    start = Date.now();
    const apiResults = await fetchMultipleAPIs(apis);
    console.log(`调用了 ${Object.keys(apiResults).length} 个 API`);
    console.log(`耗时: ${(Date.now() - start) / 1000} 秒`);

    // 示例 5：并行子代理系统
    console.log('\n4. 并行子代理系统示例');
    const system = new ParallelAgentSystem();
    start = Date.now();
    const agentResults = await system.executeParallelDevelopment('待办事项应用');
    Object.entries(agentResults).forEach(([agentType, result]) => {
        console.log(`${result.agent}: ${result.result}`);
    });
    console.log(`总耗时: ${(Date.now() - start) / 1000} 秒`);

    console.log('\n✅ 所有测试完成！');
}


// 运行测试
if (require.main === module) {
    main().catch(console.error);
}


module.exports = {
    parallelSearch,
    processFilesParallel,
    fetchMultipleAPIs,
    ParallelTaskExecutor,
    ParallelAgentSystem,
    transformDataParallel
};
