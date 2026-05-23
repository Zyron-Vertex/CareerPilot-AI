// server/app.js
// CareerPilot AI 后端服务入口

// 1. 加载环境变量（必须最先执行）
require('dotenv').config()

// 2. 引入 express 框架
const express = require('express')

// 3. 引入 cors 中间件
const cors = require('cors')

// 4. 引入 mysql2/promise
const mysql = require('mysql2/promise')

// 5. 引入 AI 学习路线路由
const learningPathRouter = require('./routes/learningPath')

// 新增：引入简历优化路由
const resumeOptimizerRouter = require('./routes/resumeOptimizer');

// 创建 Express 应用实例
const app = express()

// 配置 CORS 中间件
app.use(cors())

// 配置 JSON 解析中间件
app.use(express.json())

// 7. 创建 MySQL 连接池（从环境变量读取配置）
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0 
})

// 8. 测试数据库连接（启动时验证）
;(async function testDbConnection() {
  try {
    const connection = await pool.getConnection()
    await connection.query('SELECT 1')
    connection.release()
    console.log('✅ MySQL 数据库连接成功')
  } catch (err) {
    console.error('❌ MySQL 数据库连接失败:', err.message)
  }
})()

// -----------------------------
// 以下三个工具函数会帮助我们：
// 1. 将数字状态码翻译成中文
// 2. 统一处理成功/失败响应
// -----------------------------

/**
 * 状态码 → 中文映射
 * 为什么放在后端：前端只关心展示层，数据语义由后端保证，
 * 便于未来扩展多语言支持或调整文案。
 */
const STATUS_MAP = {
  0: '已投递',
  1: '面试中',
  2: '已录用',
  3: '已拒绝'
}

/**
 * 将数据库返回的记录中的 status 字段翻译为中文
 * @param {Array} records - 数据库原始记录数组
 * @returns {Array} 翻译后的记录数组
 */
function translateStatus(records) {
  return records.map(record => ({
    ...record,
    statusText: STATUS_MAP[record.status] || '未知状态'
  }))
}

// ==========================================
//  接口定义
// ==========================================

// 9. 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CareerPilot API is running...'
  })
})

// 10. 数据库测试接口
app.get('/api/db-test', async (req, res) => {
  try {
    const connection = await pool.getConnection()
    const [rows] = await connection.query('SELECT 1 AS result')
    connection.release()
    res.json({
      success: true,
      message: '数据库连接正常',
      data: rows[0]
    })
  } catch (err) {
    console.error('数据库测试接口出错:', err.message)
    res.status(500).json({
      success: false,
      message: '数据库连接失败',
      error: err.message
    })
  }
})

/**
 * 11. 获取投递记录（支持按状态筛选）
 *    路径：GET /api/records?status=0|1|2|3
 *    如果无 status 参数则返回全部记录
 */
app.get('/api/records', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { status } = req.query;

    let sql = 'SELECT * FROM job_application_records';
    const params = [];

    // 如果有状态筛选参数，则添加 WHERE 条件
    if (status !== undefined && status !== '') {
      // 将字符串转为整数，保证参数类型安全
      const statusInt = parseInt(status, 10);
      sql += ' WHERE status = ?';
      params.push(statusInt);
    }

    sql += ' ORDER BY apply_date DESC';

    const [rows] = await connection.query(sql, params);
    const data = translateStatus(rows);   // 将状态码转为中文

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('查询记录出错:', err.message);
    res.status(500).json({
      success: false,
      message: '查询失败',
      error: err.message
    });
  } finally {
    if (connection) connection.release();  // 无论成功失败都必须释放连接
  }
});



/**
 * 12. 删除投递记录
 *    路径：DELETE /api/records/:id
 *    必须使用参数化查询防止 SQL 注入
 */
app.delete('/api/records/:id', async (req, res) => {
  let connection;
  try {
    // 1. 获取并清洗 id
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    // 2. 验证 id 是否有效整数
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: '无效的记录 ID'
      });
    }

    // 3. 从连接池获取连接
    connection = await pool.getConnection();

    /**
     * 【参数化查询如何防止 SQL 注入】
     * 我们使用 `?` 占位符，并将实际值通过数组 [id] 传入。
     * mysql2 库会在执行前自动对参数进行转义处理：
     *   - 将 id 值安全地嵌入 SQL，而不是直接拼接字符串。
     *   - 即使恶意用户传入 "1; DROP TABLE users;--"，
     *     转义后整个值会变成一个普通字符串，不会当作 SQL 命令执行。
     * 这样就杜绝了任何通过输入篡改 SQL 逻辑的可能。
     */
    const [result] = await connection.query(
      'DELETE FROM job_application_records WHERE id = ?',
      [id]
    );

    // 4. 根据受影响行数判断删除结果
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '记录不存在'
      });
    }

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (err) {
    console.error('删除记录出错:', err.message);
    res.status(500).json({
      success: false,
      message: '删除失败',
      error: err.message
    });
  } finally {
    if (connection) connection.release();  // 必须释放连接
  }
});

/**
 * 13. 新增投递记录
 *     路径：POST /api/records
 *     请求体示例：
 *     {
 *       "company": "字节跳动",
 *       "position": "前端开发",
 *       "applyDate": "2026-05-15",
 *       "status": 0,
 *       "note": "内推"
 *     }
 */
app.post('/api/records', async (req, res) => {
  let connection;
  try {
    // 1. 解构请求体，注意前端字段 applyDate 对应数据库列 apply_date
    const { company, position, applyDate, status, note } = req.body;

    // 2. 必填字段校验
    if (!company || !position || !applyDate || status === undefined || status === null) {
      return res.status(400).json({
        success: false,
        message: '必填字段缺失：company, position, applyDate, status 为必填项'
      });
    }

    // 3. 状态值合法性校验
    const validStatuses = [0, 1, 2, 3];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status 无效，只允许以下值：${validStatuses.join(', ')}`
      });
    }

    // 4. 获取连接
    connection = await pool.getConnection();

    // 5. 参数化插入（自动转义，防止 SQL 注入）
    const [result] = await connection.query(
      `INSERT INTO job_application_records 
       (company, position, apply_date, status, note)
       VALUES (?, ?, ?, ?, ?)`,
      [company, position, applyDate, status, note || null]
    );

    // 6. 根据 insertId 查出完整记录（包含自动生成的 id, created_at, updated_at）
    const [rows] = await connection.query(
      'SELECT * FROM job_application_records WHERE id = ?',
      [result.insertId]
    );

    if (rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: '记录插入后查询失败，请重试'
      });
    }

    // 7. 状态码翻译为中文，返回给前端
    const newRecord = translateStatus(rows)[0];

    // 8. 201 Created
    res.status(201).json({
      success: true,
      data: newRecord
    });

  } catch (err) {
    console.error('新增记录出错:', err.message);
    res.status(500).json({
      success: false,
      message: '新增记录失败',
      error: err.message
    });
  } finally {
    if (connection) connection.release();  // 释放连接
  }
});


// 挂载 AI 学习路线路由
app.use('/api', learningPathRouter);

// 新增：挂载简历优化路由
app.use('/api', resumeOptimizerRouter);

app.post('/api/test', (req, res) => {
  res.json({ success: true });
});

// ==========================================
//  服务器启动前检查
// ==========================================
if (!process.env.DEEPSEEK_API_KEY) {
  console.warn('⚠️  警告：DEEPSEEK_API_KEY 未在 .env 中配置，AI 学习路线生成功能将不可用');
} else {
  console.log('✅ DEEPSEEK_API_KEY 已加载');
}
// ==========================================
//  服务器启动
// ==========================================

app.listen(3001, () => {
  console.log('CareerPilot 后端服务已启动: http://localhost:3001')
});