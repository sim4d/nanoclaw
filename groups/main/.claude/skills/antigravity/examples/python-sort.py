"""
示例 1：快速排序算法
AI 助手生成的代码示例
"""

def quicksort(arr):
    """
    快速排序算法实现

    Args:
        arr: 待排序的列表

    Returns:
        排序后的列表
    """
    # 基础情况：空列表或单元素列表已经排序
    if len(arr) <= 1:
        return arr

    # 选择基准元素（这里选择中间元素）
    pivot = arr[len(arr) // 2]

    # 分区：小于、等于、大于基准的元素
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]

    # 递归排序并合并
    return quicksort(left) + middle + quicksort(right)


# 使用示例
if __name__ == "__main__":
    # 测试数据
    test_cases = [
        [64, 34, 25, 12, 22, 11, 90],
        [5, 2, 8, 1, 9],
        [1],
        [],
        [3, 3, 3, 3]
    ]

    for arr in test_cases:
        sorted_arr = quicksort(arr)
        print(f"原数组: {arr}")
        print(f"排序后: {sorted_arr}")
        print("-" * 30)
