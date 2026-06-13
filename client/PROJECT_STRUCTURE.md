# 需求管理平台 POC - 项目结构

## 已完成的功能模块

### 1. 着陆页面 (Landing Page)
- **路径**: `/`
- **文件**: `src/app/pages/LandingPage.tsx`
- **功能**: 
  - Apple 风格的产品介绍页
  - 功能特性展示
  - 工作流演示
  - AI 助手介绍
  - 统计数据展示

### 2. 需求管理模块
#### 需求列表
- **路径**: `/app/requirements`
- **文件**: `src/app/pages/requirements/RequirementsList.tsx`
- **功能**: 
  - 需求列表表格展示
  - 搜索和筛选
  - 按状态、优先级分类
  - 快速创建需求

#### 需求详情
- **路径**: `/app/requirements/:id`
- **文件**: `src/app/pages/requirements/RequirementDetail.tsx`
- **功能**:
  - 需求详细信息
  - 多Tab展示(详情、子任务、评论、关联、文档、附件、日志)
  - 评论讨论功能
  - 子任务管理

#### 创建需求
- **路径**: `/app/requirements/new`
- **文件**: `src/app/pages/requirements/CreateRequirement.tsx`
- **功能**:
  - 完整的需求创建表单
  - AI 自动分析(模拟)
  - 表单验证

### 3. 发版计划模块
#### 发版列表
- **路径**: `/app/releases`
- **文件**: `src/app/pages/releases/ReleaseList.tsx`
- **功能**:
  - 卡片式和时间线式两种展示
  - 发版进度统计
  - 状态标识

#### 发版详情
- **路径**: `/app/releases/:id`
- **文件**: `src/app/pages/releases/ReleaseDetail.tsx`
- **功能**:
  - 发版整体进度
  - 需求完成度统计
  - 包含的需求列表
  - 审核条件检查
  - 提交审核功能

#### 创建发版
- **路径**: `/app/releases/new`
- **文件**: `src/app/pages/releases/CreateRelease.tsx`
- **功能**:
  - 发版基本信息表单
  - 计划日期设置

### 4. AI 助手
- **路径**: `/app/ai`
- **文件**: `src/app/pages/ai/AIAssistant.tsx`
- **功能**:
  - 对话式界面
  - 快速操作按钮
  - 智能分析建议
  - 实时消息流

### 5. 团队管理
- **路径**: `/app/team`
- **文件**: `src/app/pages/team/TeamManagement.tsx`
- **功能**:
  - 用户管理
  - 组管理
  - 角色权限配置
  - 多Tab切换

### 6. 系统设置
- **路径**: `/app/settings`
- **文件**: `src/app/pages/settings/Settings.tsx`
- **功能**:
  - 基本设置
  - 工作流配置
  - 自定义字段
  - 通知设置

## 设计系统

### Apple 设计风格
- **主色调**: Action Blue (#0066cc)
- **字体**: SF Pro Display / SF Pro Text
- **按钮**: 药丸形状 (pill buttons)
- **布局**: 全出血、明暗交替
- **阴影**: 仅用于产品图像

### 主题文件
- `src/styles/theme.css` - Apple 设计令牌

### 通用组件
- `GlobalNav.tsx` - 顶部导航栏
- `HeroSection.tsx` - 英雄区块
- `FeatureTile.tsx` - 功能展示瓦片
- `CustomFeatureTile.tsx` - 自定义功能瓦片
- `FeatureGrid.tsx` - 功能网格
- `StatsSection.tsx` - 统计数据区
- `Footer.tsx` - 页脚
- `WorkflowDemo.tsx` - 工作流演示
- `AIAssistantDemo.tsx` - AI 助手演示

## 路由结构

```
/                           - 着陆页
/app                        - 应用主框架
  /requirements             - 需求列表
    /new                    - 创建需求
    /:id                    - 需求详情
  /releases                 - 发版列表
    /new                    - 创建发版
    /:id                    - 发版详情
  /ai                       - AI 助手
  /team                     - 团队管理
  /settings                 - 系统设置
```

## 技术栈

- **框架**: React 18
- **路由**: React Router 7 (Data Mode)
- **样式**: Tailwind CSS 4
- **图标**: Lucide React
- **构建**: Vite 6
- **UI组件**: Radix UI + MUI

## 数据模拟

所有页面使用 Mock 数据进行演示，展示完整的交互流程。

## 已实现的核心功能

✅ 完整的页面导航系统
✅ 需求全生命周期管理界面
✅ 发版计划和审核流程界面
✅ AI 智能助手对话界面
✅ 团队和权限管理界面
✅ 系统设置界面
✅ Apple 风格设计系统
✅ 响应式布局
✅ 交互动画效果

## 后续可扩展功能

- 真实后端 API 集成
- 用户认证和授权
- 数据持久化
- 实时通知
- 文件上传
- 数据导出
- 高级筛选和搜索
- 统计报表
- 甘特图视图
