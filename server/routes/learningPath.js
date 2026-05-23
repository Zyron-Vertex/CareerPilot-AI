// server/routes/learningPath.js
const express = require('express');
const router = express.Router();

// 引入 AI 服务层
const { generateLearningPath, BusinessError } = require('../services/aiService');

// POST /api/learning-path
router.post('/learning-path', async (req, res) => {
  // 1. 输入验证
  const { targetJob } = req.body;
  if (!targetJob || typeof targetJob !== 'string' || targetJob.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: '请输入目标岗位'
    });
  }

  const job = targetJob.trim();

  // 2. 调用服务层
  try {
    const data = await generateLearningPath(job);

    // 成功返回学习计划数据
    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.error('学习路线生成失败:', err.message);

    // 3. 根据错误类型返回不同信息
    if (err instanceof BusinessError) {
      // 业务错误（如职业方向无效、计划数据异常）
      return res.json({
        success: false,
        message: err.message
      });
    }

    if (err instanceof SyntaxError) {
      // JSON 解析失败
      return res.status(500).json({
        success: false,
        message: 'AI 生成的数据格式异常，请重试'
      });
    }

    // 网络错误、API 错误等
    res.status(502).json({
      success: false,
      message: 'AI 服务暂时不可用，请稍后重试'
    });
  }
});

module.exports = router;