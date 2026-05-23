<template>
  <div class="resume-optimizer">
    <!-- 页面标题 -->
    <h1 class="title">✨ 简历项目优化器</h1>
    <p class="subtitle">填写项目信息，让 AI 帮你生成专业的简历描述（中文）</p>

    <!-- 输入区域 -->
    <div class="input-group">
      <label class="input-label">项目名称</label>
      <input
        v-model="projectName"
        type="text"
        class="text-input"
        placeholder="例如：校园二手交易平台"
        :disabled="loading"
      />
    </div>

    <div class="input-group">
      <label class="input-label">担任角色</label>
      <input
        v-model="role"
        type="text"
        class="text-input"
        placeholder="例如：后端开发、项目负责人"
        :disabled="loading"
      />
    </div>

    <div class="input-group">
      <label class="input-label">技术栈</label>
      <input
        v-model="techStack"
        type="text"
        class="text-input"
        placeholder="例如：Vue3 + Spring Boot + MySQL"
        :disabled="loading"
      />
    </div>

    <div class="input-group">
      <label class="input-label">具体工作内容</label>
      <textarea
        v-model="workContent"
        class="text-area"
        placeholder="例如：设计了 mock 假表，将数据 Agent 从 SQLite 迁移到真实 MySQL，建立 5 张表并保持字段 100% 对齐，创建只读账号，编写一键自动化部署脚本..."
        rows="5"
        :disabled="loading"
      ></textarea>
    </div>

    <!-- 操作按钮 -->
    <button
      class="optimize-btn"
      :disabled="isButtonDisabled"
      @click="handleOptimize"
    >
      {{ loading ? '优化中...' : 'AI 优化生成' }}
    </button>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="error-banner">
      <span>{{ errorMessage }}</span>
      <button class="error-close-btn" @click="errorMessage = ''">&times;</button>
    </div>

    <!-- 结果展示区 -->
    <div v-if="bullets.length > 0" class="result-section">
      <h2 class="result-title">优化结果</h2>
      <ul class="bullet-list">
        <li v-for="(bullet, index) in bullets" :key="index" class="bullet-card">
          <span class="bullet-marker">●</span>
          <span>{{ bullet }}</span>
        </li>
      </ul>

      <div class="action-row">
        <button class="copy-btn" @click="handleCopyAll">
          {{ copyBtnText }}
        </button>
      </div>
      <p class="disclaimer">内容由 AI 生成，请根据实际情况调整</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// 四个输入字段：把 reflection 改为 workContent
const projectName = ref('')
const role = ref('')
const techStack = ref('')
const workContent = ref('')

// 状态
const loading = ref(false)
const errorMessage = ref('')
const bullets = ref([])
const copyBtnText = ref('复制全部')

// 按钮禁用条件：四个输入全部为空
const isButtonDisabled = computed(() => {
  const allEmpty =
    projectName.value.trim() === '' &&
    role.value.trim() === '' &&
    techStack.value.trim() === '' &&
    workContent.value.trim() === ''
  return loading.value || allEmpty
})

// 调用后端 API（注意字段名改为 reflection，因为后端接口接收的字段是 reflection）
async function handleOptimize() {
  if (isButtonDisabled.value) return

  loading.value = true
  errorMessage.value = ''
  bullets.value = []

  try {
    const response = await fetch('/api/optimize-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: projectName.value.trim(),
        role: role.value.trim(),
        techStack: techStack.value.trim(),
        reflection: workContent.value.trim()   // 前端变量名改了，但请求体仍用后端定义的 reflection
      })
    })

    const result = await response.json()

    if (result.success) {
      bullets.value = result.data.bullets || []
    } else {
      errorMessage.value = result.message || '请求失败，请稍后重试'
    }
  } catch (err) {
    console.error('请求出错:', err)
    errorMessage.value = '网络错误，请检查连接后重试'
  } finally {
    loading.value = false
  }
}

// 复制全部 bullet points
async function handleCopyAll() {
  if (bullets.value.length === 0) return
  const text = bullets.value.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copyBtnText.value = '已复制'
    setTimeout(() => {
      copyBtnText.value = '复制全部'
    }, 2000)
  } catch (err) {
    alert('复制失败，请手动复制')
  }
}
</script>

<style scoped>
.resume-optimizer {
  max-width: 720px;
  margin: 40px auto;
  padding: 32px 28px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
  font-family: 'Segoe UI', 'PingFang SC', sans-serif;
}

.title {
  font-size: 28px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
  text-align: center;
}

.subtitle {
  text-align: center;
  color: #64748b;
  margin-bottom: 32px;
  font-size: 15px;
}

.input-group {
  margin-bottom: 20px;
}

.input-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  margin-bottom: 6px;
}

.text-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: #f8fafc;
}

.text-input:focus {
  border-color: #3b82f6;
  background: #fff;
}

.text-area {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: #f8fafc;
  resize: vertical;
  line-height: 1.5;
}

.text-area:focus {
  border-color: #3b82f6;
  background: #fff;
}

.optimize-btn {
  display: block;
  width: 100%;
  margin-top: 12px;
  padding: 14px 0;
  background: #3b82f6;
  color: white;
  font-size: 16px;
  font-weight: 500;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.optimize-btn:hover:not(:disabled) {
  background: #2563eb;
}

.optimize-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.optimize-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.error-banner {
  margin-top: 20px;
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
  color: #b91c1c;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.error-close-btn {
  background: none;
  border: none;
  color: #b91c1c;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

.result-section {
  margin-top: 32px;
}

.result-title {
  font-size: 20px;
  color: #1e293b;
  margin-bottom: 16px;
}

.bullet-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.bullet-card {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.bullet-marker {
  color: #16a34a;
  font-weight: bold;
  margin-top: 2px;
}

.bullet-card span:last-child {
  color: #14532d;
  line-height: 1.6;
  font-size: 15px;
}

.action-row {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.copy-btn {
  background: #ffffff;
  border: 1px solid #3b82f6;
  color: #3b82f6;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.copy-btn:hover {
  background: #eff6ff;
}

.disclaimer {
  text-align: right;
  font-size: 13px;
  color: #94a3b8;
  margin-top: 8px;
}

@media (max-width: 480px) {
  .resume-optimizer {
    margin: 20px 12px;
    padding: 24px 16px;
  }
}
</style>