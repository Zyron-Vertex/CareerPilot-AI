// server/routes/resumeOptimizer.js
const express = require('express');
const router = express.Router();

const { optimizeResume, BusinessError } = require('../services/aiService');

// POST /api/optimize-resume
router.post('/optimize-resume', async (req, res) => {
  try {
    // 1. 提取并做基础类型检查（确保都是字符串，缺失则默认空字符串）
    let { projectName, role, techStack, reflection } = req.body;

    projectName = typeof projectName === 'string' ? projectName : '';
    role = typeof role === 'string' ? role : '';
    techStack = typeof techStack === 'string' ? techStack : '';
    reflection = typeof reflection === 'string' ? reflection : '';

    // 2. 调用服务层
    const result = await optimizeResume(projectName, role, techStack, reflection);

    // 3. 成功返回
    res.json({
      success: true,
      data: result // { bullets: [...] }
    });

  } catch (err) {
    console.error('简历优化失败:', err.message);

    // 4. 根据错误类型返回统一格式
    if (err instanceof BusinessError) {
      // 业务错误：如“请至少填写一项信息”、优化结果为空等
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    if (err instanceof SyntaxError) {
      // AI 返回数据格式异常
      return res.status(500).json({
        success: false,
        message: 'AI 生成的数据格式异常，请重试'
      });
    }

    // 网络或其他错误
    res.status(502).json({
      success: false,
      message: 'AI 服务暂时不可用，请稍后重试'
    });
  }
});

module.exports = router;