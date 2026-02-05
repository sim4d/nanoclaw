/**
 * 示例 2：React 登录表单组件
 * AI 助手生成的代码示例
 */

import React, { useState } from 'react';

/**
 * LoginForm - 用户登录表单组件
 *
 * 功能：
 * - 用户名/邮箱输入
 * - 密码输入（带显示/隐藏切换）
 * - 表单验证
 * - 加载状态
 * - 错误提示
 */
function LoginForm({ onLogin }) {
  // 表单状态
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 表单验证
  const validateForm = () => {
    if (!email || !password) {
      setError('请填写所有字段');
      return false;
    }

    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('请输入有效的邮箱地址');
      return false;
    }

    // 密码长度验证
    if (password.length < 6) {
      setError('密码至少需要6个字符');
      return false;
    }

    return true;
  };

  // 表单提交处理
  const handleSubmit = async (e) => {
    e.preventDefault();

    // 清除之前的错误
    setError('');

    // 验证表单
    if (!validateForm()) {
      return;
    }

    // 设置加载状态
    setIsLoading(true);

    try {
      // 调用登录回调
      await onLogin({ email, password });
    } catch (err) {
      setError('登录失败：' + (err.message || '未知错误'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-form">
      <h2>用户登录</h2>

      <form onSubmit={handleSubmit}>
        {/* 邮箱输入 */}
        <div className="form-group">
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            disabled={isLoading}
            autoComplete="email"
          />
        </div>

        {/* 密码输入 */}
        <div className="form-group">
          <label htmlFor="password">密码</label>
          <div className="password-input">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              disabled={isLoading}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="toggle-password"
              disabled={isLoading}
            >
              {showPassword ? '隐藏' : '显示'}
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          className="submit-button"
          disabled={isLoading}
        >
          {isLoading ? '登录中...' : '登录'}
        </button>
      </form>

      {/* 额外链接 */}
      <div className="form-footer">
        <a href="/forgot-password">忘记密码？</a>
        <a href="/register">注册新账号</a>
      </div>
    </div>
  );
}

export default LoginForm;
