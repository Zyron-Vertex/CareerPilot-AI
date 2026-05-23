// server/services/aiService.js
// AI 服务层 —— 与 DeepSeek API 交互的唯一出口

const fetch = require('node-fetch'); // node-fetch@2 (CommonJS)

// ----------------- 配置 -----------------
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-pro';

// ----------------- 自定义业务错误类 -----------------
class BusinessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BusinessError';
  }
}

// ----------------- 公共响应解析器（内部辅助） -----------------
/**
 * 解析 DeepSeek 返回的原始文本，去除 markdown 包裹并 JSON.parse
 * @param {string} rawContent - API 返回的原始消息内容
 * @returns {object} 解析后的 JS 对象
 * @throws {SyntaxError} 当解析失败时，附带原始内容摘要
 */
function parseAIResponse(rawContent) {
  if (!rawContent) {
    throw new SyntaxError('AI 返回内容为空');
  }

  let jsonStr = rawContent.trim();

  // 去除可能的 ```json ... ``` 或 ``` ... ``` 包裹
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    // 提供前 200 字符摘要，便于调试
    const summary = jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr;
    throw new SyntaxError(`AI 响应解析失败。原始内容摘要: ${summary}`);
  }
}

// ----------------- 业务函数 A：生成学习路线 -----------------
/**
 * 为目标岗位生成 4 周学习路线
 * @param {string} targetJob - 目标岗位
 * @returns {Promise<{weeks: Array}>} 学习计划数据
 */
async function generateLearningPath(targetJob) {
  // 1. 构建 Prompt（从原路由迁移至此）
  const systemPrompt = `你是一位亲切、热心的职业规划导师，名叫"航导"。你的任务是：
1. 首先判断用户输入的"目标岗位"是否像是一个真实的职业方向（例如：Java后端、前端开发、UI设计师、产品经理、数据分析师、护士、机械工程师等）。
   - 如果不像，请用友好的语气告诉用户你暂时只能帮忙规划职业学习路线，并请他重新输入一个职业方向。
   - 回复格式必须是纯 JSON：{ "refused": true, "message": "你的友好提示" }
2. 如果像是真实的职业方向，则为其制定一个为期 4 周的学习计划。
   - 计划要具体、可执行，带有一点鼓励的语气，在每周标题或任务描述中体现出对学习者的关怀。
   - 回复格式必须是纯 JSON：{ "weeks": [ { "week": 1, "title": "...", "tasks": ["...", ...] }, ... ] }
   - 注意 tasks 是数组，每个元素是一条具体的学习任务（字符串）。

无论哪种情况，都只返回纯 JSON，不要包含任何 Markdown 标记或额外文字。`;

  const userMessage = `我想成为"${targetJob}"，请帮我规划一下学习路线。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  // 2. 调用 DeepSeek API
  const aiMessage = await callDeepSeekAPI(messages, 0.3);

  // 3. 解析响应
  const parsed = parseAIResponse(aiMessage);

  // 4. 业务校验
  if (parsed.refused === true) {
    // 职业方向无效，抛业务错误，由路由层返回友好提示
    throw new BusinessError(parsed.message || '请输入有效的职业方向');
  }

  if (!parsed.weeks || !Array.isArray(parsed.weeks) || parsed.weeks.length === 0) {
    throw new BusinessError('AI 生成的学习计划数据异常，请稍后重试');
  }

  return parsed; // { weeks: [...] }
}

// ----------------- 业务函数 B：优化简历项目描述 -----------------
/**
 * 将学生的零散项目笔记润色为专业简历 bullet points
 * @param {string} projectName - 项目名称
 * @param {string} role - 角色
 * @param {string} techStack - 技术栈
 * @param {string} reflection - 反思/收获
 * @returns {Promise<{bullets: string[]}>} 优化后的简历要点
 */
async function optimizeResume(projectName, role, techStack, reflection) {
  // 1. 非空检查：如果四个参数全部为空（或只有空白字符）
  const inputs = [projectName, role, techStack, reflection]
    .map(v => (typeof v === 'string' ? v.trim() : ''));
  if (inputs.every(v => v.length === 0)) {
    throw new BusinessError('请至少填写一项信息');
  }

  // 2. 构建包含可用信息的上下文文本（智能省略空白项）
  const contextParts = [];
  if (projectName && projectName.trim()) contextParts.push(`- 项目名称：${projectName.trim()}`);
  if (role && role.trim()) contextParts.push(`- 担任角色：${role.trim()}`);
  if (techStack && techStack.trim()) contextParts.push(`- 技术栈：${techStack.trim()}`);
  if (reflection && reflection.trim()) contextParts.push(`- 反思/收获：${reflection.trim()}`);
  const contextText = contextParts.join('\n');

  const systemPrompt = `你是一位资深 HR 兼简历优化专家，专门为中国学生润色简历。

【严格语言规则】
- 你必须**始终使用中文**来撰写简历要点，哪怕输入中包含英文技术术语，也要围绕术语用中文组织句子。
- 允许保留的英文仅限于：项目名称、公认的技术缩写（如 MySQL、Python、Spring Boot 等）。
- 严禁生成任何英文句子或英文短语，一旦出现即视为任务失败。

【风格要求】
每条 bullet point 遵循“动作 + 方法 + 成果量化或技术深度”的 STAR/X 原则，语言专业、简洁、有力，使用主动语态。
必须基于提供的真实信息，不得编造任何数据或技术名词。

【输出格式】
只输出一个纯 JSON 对象：{ "bullets": ["要点1", "要点2", ...] }，不包含 Markdown 标记或其他文字。

【中文示例】
输入笔记：“我用 Python 写了个爬虫抓取天气数据存到 MySQL，并且做了可视化大屏。”
输出：
{ "bullets": [
  "设计并开发 Python 爬虫，自动采集多源天气数据，数据完整率达 98%。",
  "搭建 MySQL 数据库存储历史天气信息，优化查询索引以支持每秒 50+ 并发请求。",
  "使用 ECharts 构建实时可视化大屏，直观展示温度、湿度等核心指标，辅助团队每日决策。"
]} 

现在请根据用户提供的笔记，参照上述示例，用中文生成简历要点。`;

const userMessage = `我的项目笔记如下（请务必用中文生成简历要点，保留必要的英文技术名词）：\n${contextText}\n\n只返回 JSON。`;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  // 3. 调用 DeepSeek API（temperature=0.5 增加多样性）
  const aiMessage = await callDeepSeekAPI(messages, 0.5);

  // 4. 解析响应
  const parsed = parseAIResponse(aiMessage);

  // 5. 业务校验
  if (!parsed.bullets || !Array.isArray(parsed.bullets) || parsed.bullets.length === 0) {
    throw new BusinessError('AI 返回的简历优化建议为空，请稍后重试');
  }

  return { bullets: parsed.bullets };
}

// ----------------- 内部工具：封装 API 调用 -----------------
/**
 * 通用 DeepSeek Chat API 调用封装
 * @param {Array} messages - 对话消息数组
 * @param {number} temperature - 温度参数
 * @returns {Promise<string>} AI 回复的文本内容
 */
async function callDeepSeekAPI(messages, temperature = 0.3) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('服务器未配置 AI 服务，请联系管理员');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`DeepSeek API 错误 (${response.status}):`, errorBody);
    throw new Error(`AI 服务暂时不可用 (HTTP ${response.status})`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('AI 返回的消息内容为空');
  }

  return content;
}

// ----------------- 导出 -----------------
module.exports = {
  generateLearningPath,
  optimizeResume,
  BusinessError
};