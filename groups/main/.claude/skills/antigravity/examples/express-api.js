/**
 * 示例 3：Express.js API 服务器
 * AI 助手生成的代码示例
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * 创建 Express 应用
 */
const app = express();

// 中间件配置
app.use(express.json()); // 解析 JSON 请求体
app.use(express.urlencoded({ extended: true })); // 解析 URL 编码的请求体

// 模拟用户数据库
const users = [];

// JWT 密钥（生产环境应使用环境变量）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * 用户注册
 * POST /api/register
 */
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 验证必填字段
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }

    // 检查用户是否已存在
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: '该邮箱已被注册'
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建新用户
    const newUser = {
      id: users.length + 1,
      username,
      email,
      password: hashedPassword,
      createdAt: new Date()
    };

    users.push(newUser);

    // 生成 JWT token
    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email
        },
        token
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 用户登录
 * POST /api/login
 */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 验证必填字段
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }

    // 查找用户
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '邮箱或密码错误'
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '邮箱或密码错误'
      });
    }

    // 生成 JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        token
      }
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 获取当前用户信息
 * GET /api/me
 * 需要认证
 */
app.get('/api/me', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用户不存在'
    });
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      }
    }
  });
});

/**
 * JWT 认证中间件
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: '无效的认证令牌'
      });
    }

    req.userId = decoded.userId;
    req.email = decoded.email;
    next();
  });
}

/**
 * 错误处理中间件
 */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

/**
 * 启动服务器
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

module.exports = app;
