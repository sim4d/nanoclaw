# Antigravity Skill 认证指南

## 📋 认证方式说明

Antigravity skill 作为 Andy AI 助手的内置功能，**不需要单独的登录认证**。

你只需要：

1. ✅ **直接使用** - 在对话中直接提出编程需求
2. ✅ **自然交互** - 像与程序员对话一样描述需求
3. ✅ **即时响应** - AI 会立即生成代码或提供建议

## 💬 使用示例

### 示例 1：代码生成
```
你：antigravity skill：帮我用 Python 写一个二分查找

Andy：好的，我来为你编写二分查找算法：

def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

# 使用示例
numbers = [1, 3, 5, 7, 9, 11, 13]
result = binary_search(numbers, 7)
print(f"找到元素，索引为：{result}")

这个实现的时间复杂度是 O(log n)，空间复杂度是 O(1)。
```

### 示例 2：代码调试
```
你：antigravity skill：这段代码有问题，帮我看看
    def calculate_average(numbers):
        total = 0
        for num in numbers:
            total += num
        return total / len(numbers)

Andy：分析你的代码，发现潜在问题：

**问题：** 当传入空列表时会抛出 ZeroDivisionError

**修复方案：**
def calculate_average(numbers):
    if not numbers:
        return 0  # 或返回 None，根据需求决定
    total = sum(numbers)
    return total / len(numbers)

或者更 Pythonic 的写法：
def calculate_average(numbers):
    return sum(numbers) / len(numbers) if numbers else 0
```

### 示例 3：代码优化
```
你：antigravity skill：优化这段代码的性能
    [粘贴代码]

Andy：让我分析性能瓶颈...

**发现的问题：**
1. 嵌套循环导致 O(n²) 复杂度
2. 重复计算相同的值
3. 未使用缓存

**优化后的代码：**
[优化后的代码]

**性能提升：** 从 O(n²) 降到 O(n)
```

## 🎯 触发关键词

你可以在对话中使用以下方式触发编程功能：

- "帮我写..." / "帮我创建..."
- "分析这段代码..."
- "优化这个函数..."
- "调试这段代码..."
- "解释一下这段代码..."
- "为...生成测试用例"
- "重构这段代码..."

或者直接加上 "antigravity skill：" 前缀来明确使用编程功能。

## 📊 支持的操作

| 操作类型 | 示例命令 |
|---------|---------|
| 代码生成 | "用 Node.js 创建一个 REST API" |
| 代码分析 | "分析这段算法的时间复杂度" |
| Bug 修复 | "修复这个内存泄漏问题" |
| 代码解释 | "解释这个正则表达式的作用" |
| 代码重构 | "重构这个函数，使其更清晰" |
| 测试生成 | "为这个类生成单元测试" |
| 性能优化 | "优化这个数据库查询" |

## ⚡ 高级用法

### 1. 多轮对话构建
```
你：antigravity skill：创建一个用户认证系统

Andy：好的，需要实现哪些功能？
- 用户注册
- 用户登录
- 密码重置
- JWT 认证

你：需要注册和登录

Andy：明白了，使用什么技术栈？
- Express.js
- Flask
- Spring Boot

你：用 Express.js

Andy：好的，我来创建 Express.js 认证系统...
[生成代码]
```

### 2. 结合其他功能
```
你：antigravity skill：创建一个爬虫脚本
    然后用 browser automation 测试它

Andy：好的，我先创建爬虫脚本...
[生成 Python 爬虫代码]

现在我来帮你使用 browser-use 测试它...
[调用 browser automation 功能]
```

## 🔧 配置选项

你可以在对话中指定：
- 编程语言偏好
- 代码风格规范
- 是否需要注释
- 错误处理级别
- 测试框架选择

## 💡 最佳实践

1. **明确需求** - 详细描述你想要的功能
2. **提供上下文** - 分享相关代码或项目背景
3. **逐步构建** - 复杂功能分步骤实现
4. **请求解释** - 让 AI 解释生成的代码
5. **迭代优化** - 根据反馈持续改进

---

**总结：** Antigravity skill 是 Andy 的内置能力，无需登录认证，直接在对话中使用即可！
