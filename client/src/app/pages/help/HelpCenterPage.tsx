// Help Center — Professional documentation-style page
// Models sites like DeepSeek API Docs / VitePress / Docusaurus
// Three-column layout: left nav + center content + right TOC

import { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Search,
  ExternalLink,
  Hash,
  Menu,
  ArrowUp,
  Copy,
  Check,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface DocSection {
  id: string;
  title: string;
  icon?: string;
  children?: DocSubSection[];
}

interface DocSubSection {
  id: string;
  title: string;
}

interface TocItem {
  id: string;
  title: string;
  level: number; // 1 = h2, 2 = h3
}

// ── Navigation Data ────────────────────────────────────────────────

const DOC_SECTIONS: DocSection[] = [
  {
    id: 'overview',
    title: '平台概览',
    icon: '🏠',
    children: [
      { id: 'what-is-wmos', title: '什么是需求管理平台' },
      { id: 'platform-features', title: '核心功能一览' },
      { id: 'role-permissions', title: '角色与权限' },
      { id: 'login-account', title: '账号登录' },
    ],
  },
  {
    id: 'requirements',
    title: '需求管理',
    icon: '📋',
    children: [
      { id: 'requirement-list', title: '需求列表' },
      { id: 'batch-delete', title: '批量删除' },
      { id: 'recycle-bin', title: '回收站' },
      { id: 'create-requirement', title: '创建需求' },
      { id: 'req-type-field', title: '需求类型字段' },
      { id: 'edit-requirement', title: '编辑需求' },
      { id: 'status-transition', title: '状态流转' },
      { id: 'requirement-docs', title: '文档协作' },
      { id: 'test-cases', title: '测试用例' },
      { id: 'regression-test', title: '回归测试' },
      { id: 'ai-insights', title: 'AI 智能问答' },
    ],
  },
  {
    id: 'releases',
    title: '发版计划',
    icon: '🚀',
    children: [
      { id: 'create-release', title: '创建发版' },
      { id: 'manage-release', title: '管理发版需求' },
      { id: 'release-progress', title: '查看发版进度' },
    ],
  },
  {
    id: 'ai-assistant',
    title: 'AI 助手',
    icon: '🤖',
    children: [
      { id: 'ai-chat', title: '智能问答' },
      { id: 'ai-insight-detail', title: '需求洞察' },
      { id: 'ai-skills', title: 'AI 技能管理' },
      { id: 'ai-history', title: '对话历史' },
    ],
  },
  {
    id: 'manuals',
    title: '操作手册',
    icon: '📖',
    children: [
      { id: 'manual-articles', title: '知识文章' },
      { id: 'manual-docs', title: '文档管理' },
      { id: 'manual-links', title: '外链导航' },
    ],
  },
  {
    id: 'team',
    title: '团队管理',
    icon: '👥',
    children: [
      { id: 'team-roles', title: '角色说明' },
      { id: 'user-management', title: '用户管理' },
    ],
  },
  {
    id: 'settings',
    title: '设置',
    icon: '⚙️',
    children: [
      { id: 'module-config', title: '模块枚举配置' },
      { id: 'category-settings', title: '需求分类与编码' },
      { id: 'req-type-settings', title: '需求类型管理' },
      { id: 'number-rule-settings', title: '需求编码规则' },
      { id: 'ai-config', title: 'AI 模型配置' },
      { id: 'ai-skills-settings', title: 'AI 技能管理' },
      { id: 'rag-settings', title: 'RAG 设置' },
      { id: 'kb-management', title: '知识库管理' },
      { id: 'workflow-settings', title: '工作流配置' },
    ],
  },
];

// ── In-page TOC items per section (h2 + h3 level) ─────────────────

const TOC_MAP: Record<string, TocItem[]> = {
  overview: [
    { id: 'what-is-wmos', title: '什么是需求管理平台', level: 1 },
    { id: 'platform-features', title: '核心功能一览', level: 1 },
    { id: 'role-permissions', title: '角色与权限', level: 1 },
    { id: 'login-account', title: '账号登录', level: 1 },
    { id: 'login-remember', title: '记住我/记住密码', level: 2 },
    { id: 'password-policy', title: '密码规则', level: 2 },
  ],
  requirements: [
    { id: 'requirement-list', title: '需求列表', level: 1 },
    { id: 'req-list-filter', title: '筛选栏', level: 2 },
    { id: 'req-list-tags', title: '优先级与类型标签', level: 2 },
    { id: 'req-list-more', title: '更多操作', level: 2 },
    { id: 'batch-delete', title: '批量删除', level: 1 },
    { id: 'recycle-bin', title: '回收站', level: 1 },
    { id: 'create-requirement', title: '创建需求', level: 1 },
    { id: 'create-steps', title: '操作步骤', level: 2 },
    { id: 'req-type-field', title: '需求类型字段', level: 1 },
    { id: 'edit-requirement', title: '编辑需求', level: 1 },
    { id: 'status-transition', title: '状态流转', level: 1 },
    { id: 'requirement-docs', title: '文档协作', level: 1 },
    { id: 'test-cases', title: '测试用例', level: 1 },
    { id: 'tc-generate', title: 'AI 生成用例', level: 2 },
    { id: 'tc-manual', title: '手动管理用例', level: 2 },
    { id: 'tc-execute', title: '测试执行', level: 2 },
    { id: 'regression-test', title: '回归测试', level: 1 },
    { id: 'regression-suite', title: '回归套件', level: 2 },
    { id: 'ai-insights', title: 'AI 智能问答', level: 1 },
  ],
  releases: [
    { id: 'create-release', title: '创建发版', level: 1 },
    { id: 'manage-release', title: '管理发版需求', level: 1 },
    { id: 'release-progress', title: '查看发版进度', level: 1 },
  ],
  'ai-assistant': [
    { id: 'ai-chat', title: '智能问答', level: 1 },
    { id: 'ai-insight-detail', title: '需求洞察', level: 1 },
    { id: 'ai-skills', title: 'AI 技能管理', level: 1 },
    { id: 'ai-history', title: '对话历史', level: 1 },
  ],
  manuals: [
    { id: 'manual-articles', title: '知识文章', level: 1 },
    { id: 'manual-docs', title: '文档管理', level: 1 },
    { id: 'manual-links', title: '外链导航', level: 1 },
  ],
  team: [
    { id: 'team-roles', title: '角色说明', level: 1 },
    { id: 'user-management', title: '用户管理', level: 1 },
  ],
  settings: [
    { id: 'module-config', title: '模块枚举配置', level: 1 },
    { id: 'category-settings', title: '需求分类与编码', level: 1 },
    { id: 'category-tree', title: '分类树结构', level: 2 },
    { id: 'category-code', title: '一级/二级模块 code', level: 2 },
    { id: 'category-sort', title: '排序规则', level: 2 },
    { id: 'req-type-settings', title: '需求类型管理', level: 1 },
    { id: 'req-type-basics', title: '类型字典与种子', level: 2 },
    { id: 'req-type-edit-code', title: '修改编码的引用限制', level: 2 },
    { id: 'number-rule-settings', title: '需求编码规则', level: 1 },
    { id: 'number-rule-format', title: '5 段式编码格式', level: 2 },
    { id: 'number-rule-encode-seq', title: '序列号编码 001 → A01', level: 2 },
    { id: 'number-rule-counter', title: '计数桶与导入', level: 2 },
    { id: 'ai-config', title: 'AI 模型配置', level: 1 },
    { id: 'ai-skills-settings', title: 'AI 技能管理', level: 1 },
    { id: 'rag-settings', title: 'RAG 设置', level: 1 },
    { id: 'kb-management', title: '知识库管理', level: 1 },
    { id: 'workflow-settings', title: '工作流配置', level: 1 },
  ],
};

// ── Content Components ─────────────────────────────────────────────

function DocContent({ sectionId }: { sectionId: string }) {
  switch (sectionId) {
    case 'what-is-wmos':
      return <WhatIsPlatform />;
    case 'platform-features':
      return <PlatformFeatures />;
    case 'role-permissions':
      return <RolePermissions />;
    case 'login-account':
      return <LoginAccount />;
    case 'requirement-list':
      return <RequirementList />;
    case 'batch-delete':
      return <BatchDelete />;
    case 'recycle-bin':
      return <RecycleBin />;
    case 'create-requirement':
      return <CreateRequirement />;
    case 'req-type-field':
      return <ReqTypeField />;
    case 'edit-requirement':
      return <EditRequirement />;
    case 'status-transition':
      return <StatusTransition />;
    case 'requirement-docs':
      return <RequirementDocs />;
    case 'test-cases':
      return <TestCases />;
    case 'regression-test':
      return <RegressionTest />;
    case 'ai-insights':
      return <AIInsights />;
    case 'create-release':
      return <CreateRelease />;
    case 'manage-release':
      return <ManageRelease />;
    case 'release-progress':
      return <ReleaseProgress />;
    case 'ai-chat':
      return <AIChat />;
    case 'ai-insight-detail':
      return <AIInsightDetail />;
    case 'ai-skills':
      return <AISkills />;
    case 'ai-history':
      return <AIHistory />;
    case 'manual-articles':
      return <ManualArticles />;
    case 'manual-docs':
      return <ManualDocs />;
    case 'manual-links':
      return <ManualLinks />;
    case 'team-roles':
      return <TeamRoles />;
    case 'user-management':
      return <UserManagement />;
    case 'module-config':
      return <ModuleConfig />;
    case 'category-settings':
      return <CategorySettings />;
    case 'req-type-settings':
      return <ReqTypeSettings />;
    case 'number-rule-settings':
      return <NumberRuleSettings />;
    case 'ai-config':
      return <AIConfig />;
    case 'ai-skills-settings':
      return <AISkillsSettings />;
    case 'rag-settings':
      return <RAGSettings />;
    case 'kb-management':
      return <KBManagement />;
    case 'workflow-settings':
      return <WorkflowSettings />;
    default:
      return <EmptyContent />;
  }
}

// ── Section Contents ───────────────────────────────────────────────

function WhatIsPlatform() {
  return (
    <div className="space-y-6">
      <div className="prose max-w-none">
        <h2 id="what-is-wmos">什么是需求管理平台</h2>
        <p>
          需求管理平台是 WMOS（Warehouse Management Operating System）医药物流仓储系统的配套需求管理工具，
          用于管理 WMS 系统的业务需求全生命周期，涵盖需求收集、评审、设计、开发、测试到发版的完整流程。
        </p>

        <Callout type="info" title="平台定位">
          本平台不是 WMS 业务系统本身，而是 <strong>管理 WMS 需求</strong> 的协作平台。
          它帮助需求分析师、开发团队、测试团队高效协作，确保每个需求都经过充分评审和验证。
        </Callout>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FeatureCard
          icon="📝"
          title="需求全生命周期"
          desc="从需求创建、评审、设计、开发、测试到发版的完整流程跟踪"
        />
        <FeatureCard
          icon="🤖"
          title="AI 智能辅助"
          desc="基于 RAG 知识库的 AI 问答、需求洞察分析、数据模型建议"
        />
        <FeatureCard
          icon="👥"
          title="团队协作"
          desc="多角色协作，文档共享，回归测试跟踪，发版计划管理"
        />
      </div>
    </div>
  );
}

function PlatformFeatures() {
  return (
    <div className="space-y-6">
      <h2 id="platform-features">核心功能一览</h2>
      <p>平台提供以下核心功能模块：</p>

      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">模块</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">功能</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">说明</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['需求管理', '需求列表', 'TAPD 风格双行筛选栏，优先级/类型彩色标签，标题前缀徽章，分类计数动态刷新'],
              ['需求管理', '批量删除', '多选 + 二次确认 + 软删除（回收站可恢复）'],
              ['需求管理', '回收站', '软删除可还原，ADMIN 可彻底物理删除（级联清理）'],
              ['需求管理', '创建/编辑/查看', '支持 BRD/FSD/PRD 多种需求类型，独立「需求类型」选择字段（不再仅由分类推断）'],
              ['需求管理', '状态流转', '工作流约束状态变更，支持 @mention 通知'],
              ['需求管理', '文档协作', '上传 PRD/BRD/FSD 等文档，支持 Markdown、Word、PDF 格式'],
              ['需求管理', '测试用例', 'AI 自动生成/补充测试用例，支持手动创建/编辑/执行'],
              ['需求管理', '回归测试', '创建回归套件，逐条执行，自动计算通过率'],
              ['需求管理', 'AI 智能问答', '基于 RAG 检索需求文档和知识库，AI 辅助回答'],
              ['发版计划', '创建/管理', '创建发版批次，关联需求，跟踪发版进度'],
              ['AI 助手', '智能对话', '独立 AI 对话页面，支持关联需求上下文，显示 AI 思考过程'],
              ['AI 助手', '需求洞察', 'AI 自动分析需求，生成数据模型建议和 GSP 合规提示'],
              ['AI 助手', '技能管理', '7 种预置技能（架构/分析/对话/RAG/规划/测试/估算），支持自定义'],
              ['操作手册', '知识文章', '管理员维护 Markdown 格式知识文章'],
              ['操作手册', '文档管理', '上传/下载 PDF/Word/Excel 文档'],
              ['团队管理', '用户/角色管理', '管理员管理用户账号、角色和分组，支持自定义角色'],
              ['设置', '模块配置', '配置「所属模块」枚举选项，需求表单下拉和列表筛选同步生效'],
              ['设置', '需求分类', '一级/二级模块 code 维护；一级手动排序，二级按编码自动排序'],
              ['设置', '需求类型', '字典化管理 4 个默认类型（需求/缺陷/改进/任务），可增删改；改 code 受引用数限制'],
              ['设置', '需求编码', '5 段式 HD-一级-二级-类型-seq；按「选中分类+类型」计数；开关即时保存'],
              ['需求管理', 'Excel 导入/导出', '14 列模板，导入按填写编码入库并回填计数桶；导出字段与模板对齐'],
              ['设置', 'AI 配置', '配置 AI 模型、Temperature、最大 Token 等参数'],
              ['设置', 'AI 技能', '管理 AI 技能定义和任务调用映射（7 个任务）'],
              ['设置', '工作流', '可视化配置状态节点和流转规则'],
              ['设置', '知识库', '创建和管理知识库，配置 RAG 分块和检索参数'],
            ].map(([module, feature, desc], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-medium text-[var(--ink)]">{module}</td>
                <td className="py-2.5 px-3 text-[var(--ink)]">{feature}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolePermissions() {
  return (
    <div className="space-y-6">
      <h2 id="role-permissions">角色与权限</h2>
      <p>平台定义多种用户角色，管理员可在团队管理页面自定义角色。</p>

      <div className="space-y-3">
        <RoleCard
          name="ADMIN"
          label="管理员"
          color="bg-red-50 text-red-700 border-red-200"
          permissions={['所有需求操作（创建/编辑/删除）', '文档上传与管理', '操作手册维护', '用户管理（添加/编辑/停用）', '角色管理（自定义角色 CRUD）', 'AI 模型和 RAG 配置', '知识库管理', '工作流配置', '需求分类与一级/二级模块 code 维护', '需求类型字典管理（增删改/启停）', '需求编码规则配置（启用开关/项目前缀）', '回收站永久删除（普通用户只能还原）']}
        />
        <RoleCard
          name="GROUP_LEAD"
          label="组长"
          color="bg-blue-50 text-blue-700 border-blue-200"
          permissions={['管理组内需求', '评审和分配需求', '创建发版计划', '查看组内回归结果']}
        />
        <RoleCard
          name="MEMBER"
          label="成员"
          color="bg-green-50 text-green-700 border-green-200"
          permissions={['查看需求列表和详情', '编辑自己创建的需求', '上传文档到需求', '执行回归测试', '使用 AI 助手']}
        />
      </div>

      <Callout type="info" title="自定义角色">
        ADMIN 用户可在团队管理页面的「角色」Tab 中创建自定义角色。系统内置角色（ADMIN/GROUP_LEAD/MEMBER）不可删除。
      </Callout>

      <Callout type="warning" title="注意">
        删除需求和用户管理操作仅限 ADMIN 角色。成员创建的需求，只有 ADMIN 和管理员授权的组长可以删除。
      </Callout>
    </div>
  );
}

function CreateRequirement() {
  return (
    <div className="space-y-6">
      <h2 id="create-requirement">创建需求</h2>
      <p>需求是平台的核心实体，每个需求包含以下关键信息：</p>

      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">字段</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">类型</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">说明</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">必填</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['需求编号', 'String', '规则关闭：REQ-2026-005；规则开启：HD-RM-1001-R-001（见「需求编码规则」）', '是'],
              ['标题', 'String', '需求简述，如"冷链药品追溯功能"', '是'],
              ['需求类型', 'Enum', 'BRD（业务需求）/ FSD（功能规格）/ PRD（产品需求）', '是'],
              ['优先级', 'Enum', 'P0（紧急）/ P1（高）/ P2（中）/ P3（低）', '是'],
              ['模块', 'String', '所属业务模块，如入库、出库、库存、GSP 等', '否'],
              ['状态', 'Enum', '待评审 / 评审中 / 设计中 / 开发中 / 测试中 / 已完成', '是'],
              ['描述', 'Markdown', '需求详细描述，支持 Markdown 格式', '否'],
              ['关联表', 'JSON', '涉及的数据库表名列表', '否'],
              ['GSP 影响', 'String', '是否涉及 GSP 法规条款及影响分析', '否'],
            ].map(([field, type, desc, required], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-mono text-[13px] text-[var(--ink)]">{field}</td>
                <td className="py-2.5 px-3"><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] text-[var(--primary)]">{type}</code></td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{desc}</td>
                <td className="py-2.5 px-3 text-[13px]">{required === '是' ? <span className="text-red-600">●</span> : <span className="text-[var(--ink-muted-48)]">○</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 id="create-steps">操作步骤</h3>
      <div className="space-y-3">
        <Step number={1} title="进入需求管理页面">
          点击顶部导航栏的「需求管理」，进入需求列表页。
        </Step>
        <Step number={2} title="点击「新建需求」按钮">
          在列表页右上角找到「新建需求」按钮（蓝色圆角按钮），点击打开创建表单。
        </Step>
        <Step number={3} title="填写需求信息">
          填写标题、选择需求类型、优先级、模块和初始状态。描述框支持 Markdown 语法。
        </Step>
        <Step number={4} title="提交">
          点击「创建」按钮提交，系统将自动生成需求编号并跳转到详情页。
        </Step>
      </div>

      <Callout type="tip" title="提示">
        需求描述使用 Markdown 格式，支持标题、列表、代码块、表格等语法。可在编辑时点击「预览」按钮查看渲染效果。
      </Callout>

      <Callout type="info" title="需求类型与编码">
        表单中的「需求类型」是<strong>独立</strong>的选择字段，下方「需求分类」会自动按所选类型过滤。若已开启「需求编码规则」（设置 → 需求编码），须选择<strong>具体业务分类</strong>（不能选类型根），且对应的一级/二级模块 <code className="px-1 py-0.5 bg-[var(--canvas)] rounded text-[12px]">code</code> 须已在「设置 → 需求分类」中配置好。
      </Callout>
    </div>
  );
}

function EditRequirement() {
  return (
    <div className="space-y-6">
      <h2 id="edit-requirement">编辑需求</h2>
      <p>在需求列表页点击需求卡片，或在详情页点击「编辑」按钮，进入编辑模式。可修改除需求编号外的所有字段。</p>
      <Callout type="info" title="变更留痕">
        需求的关键字段变更（状态、优先级、描述）会被记录到审计日志中，满足 GSP 合规要求（条款 04001-04003）。
      </Callout>
    </div>
  );
}

function RequirementDocs() {
  return (
    <div className="space-y-6">
      <h2 id="requirement-docs">文档协作</h2>
      <p>每个需求支持关联多个文档，用于存放 PRD、BRD、FSD 等产品文档。</p>

      <h3>支持的文档格式</h3>
      <div className="flex flex-wrap gap-2">
        {['.md (Markdown)', '.docx (Word)', '.pdf', '.html'].map((ext) => (
          <span key={ext} className="px-3 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[13px] font-mono text-[var(--ink)]">
            {ext}
          </span>
        ))}
      </div>

      <h3>文档索引</h3>
      <p>上传的文档会自动索引到 RAG 知识库，支持以下操作：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>预览</strong>：Markdown 文档直接渲染，Word 文档转为 HTML 预览，PDF 显示缩略图</li>
        <li><strong>下载</strong>：点击下载按钮获取原始文件</li>
        <li><strong>AI 检索</strong>：AI 助手在回答时会自动检索已索引的文档内容</li>
      </ul>
    </div>
  );
}

function StatusTransition() {
  return (
    <div className="space-y-6">
      <h2 id="status-transition">状态流转</h2>
      <p>需求的状态变更受工作流规则约束，确保流程合规。</p>

      <h3>状态流转操作</h3>
      <div className="space-y-3">
        <Step number={1} title="点击状态标签">
          在需求列表或详情页点击当前状态标签，弹出状态流转对话框。
        </Step>
        <Step number={2} title="选择目标状态">
          对话框仅显示工作流允许的目标状态选项（如"待评审"→"评审中"）。
        </Step>
        <Step number={3} title="填写变更说明">
          输入状态变更原因，支持 <code className="px-1 py-0.5 bg-[var(--canvas)] rounded text-[12px]">@用户名</code> 提及相关人员。
        </Step>
        <Step number={4} title="提交">
          点击确认后系统校验流转规则，通过后更新状态并记录审计日志。
        </Step>
      </div>

      <Callout type="warning" title="注意">
        如果当前状态到目标状态的流转规则未在工作流中配置，系统会拒绝变更并提示原因。仅 ADMIN 可配置工作流规则。
      </Callout>

      <h3>状态变更通知</h3>
      <p>状态变更后，系统自动向以下人员发送通知：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>需求创建人</strong>：知晓需求状态变化</li>
        <li><strong>新处理人</strong>：被分配任务时收到 ASSIGNED 通知</li>
        <li><strong>被 @提及的用户</strong>：收到 MENTIONED 通知</li>
      </ul>
    </div>
  );
}

function TestCases() {
  return (
    <div className="space-y-6">
      <h2 id="test-cases">测试用例</h2>
      <p>需求详情页的「测试用例」Tab 支持 AI 自动生成和手动管理测试用例。</p>

      <h3 id="tc-generate">AI 生成用例</h3>
      <p>点击「AI 生成测试用例」按钮，系统会：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li>读取需求的标题、描述、模块、关联表等信息</li>
        <li>调用 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] text-[var(--primary)]">wm-tester</code> 技能生成结构化用例</li>
        <li>自动去重已有用例标题，避免重复</li>
        <li>生成编号（TC-001、TC-002...）后批量写入</li>
      </ul>

      <Callout type="tip" title="AI 补充用例">
        当需求已有测试用例时，按钮变为「AI 补充用例」。AI 会跳过已覆盖的场景，生成新的用例补充遗漏点。
      </Callout>

      <h3 id="tc-manual">手动管理用例</h3>
      <p>除 AI 生成外，也可手动创建测试用例：</p>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">字段</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">说明</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['用例标题', '用例简述，必填'],
              ['前置条件', '执行用例前需满足的条件'],
              ['测试步骤', 'JSON 格式：每步包含"步骤描述"和"期望结果"'],
              ['优先级', 'P0(紧急) / P1(高) / P2(中) / P3(低)'],
            ].map(([field, desc], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-medium text-[var(--ink)]">{field}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 id="tc-execute">测试执行</h3>
      <p>每条测试用例可多次执行，记录执行结果：</p>
      <div className="space-y-3">
        <Step number={1} title="展开用例">
          在测试用例列表中点击展开要执行的用例。
        </Step>
        <Step number={2} title="点击「记录测试结果」">
          填写执行状态（通过/失败/阻塞）、备注说明。
        </Step>
        <Step number={3} title="上传截图（可选）">
          可上传执行截图作为证据，支持多张图片。
        </Step>
        <Step number={4} title="保存">
          提交后生成带时间戳的执行记录，可在时间线中查看历史。
        </Step>
      </div>

      <Callout type="info" title="用例来源">
        测试用例来源分为两类：<strong>AI 生成</strong>（自动编号、可补充）和 <strong>手动创建</strong>（可编辑）。仅手动来源的用例允许编辑修改。
      </Callout>
    </div>
  );
}

function AIInsights() {
  return (
    <div className="space-y-6">
      <h2 id="ai-insights">AI 智能问答</h2>
      <p>在需求详情页的「AI 问答」Tab 中，可以针对当前需求向 AI 提问。AI 会基于 RAG 检索以下数据源：</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DataSourceCard title="需求文档" desc="该需求关联的 PRD/BRD/FSD 文档" />
        <DataSourceCard title="产品知识库" desc="「产品需求文档」知识库中已索引的所有文档" />
        <DataSourceCard title="历史对话" desc="当前会话的上下文记忆" />
        <DataSourceCard title="需求元数据" desc="需求标题、描述、关联表、GSP 影响等" />
      </div>
    </div>
  );
}

function RegressionTest() {
  return (
    <div className="space-y-6">
      <h2 id="regression-test">回归测试</h2>
      <p>回归测试用于验证需求修改后，原有功能是否仍然正常。</p>

      <h3>回归套件</h3>
      <p id="regression-suite">回归套件是测试用例的集合，可跨需求复用：</p>
      <div className="space-y-3">
        <Step number={1} title="创建回归套件">
          在需求详情页选择要纳入回归的测试用例，输入套件名称（同一需求下名称必须唯一），点击创建。
        </Step>
        <Step number={2} title="执行回归">
          点击套件上的「执行回归」按钮，系统为套件中每条用例创建一条执行记录（初始状态为"待执行"）。
        </Step>
        <Step number={3} title="逐条录入结果">
          对每条用例选择执行状态（通过/失败/阻塞）、填写备注，可上传截图。
        </Step>
        <Step number={4} title="查看汇总">
          完成后系统自动统计：通过数、失败数、阻塞数、通过率%。
        </Step>
      </div>

      <Callout type="warning" title="注意">
        回归执行表单中状态下拉框无默认值，必须手动选择。确保回归数据真实可靠。
      </Callout>

      <h3>需求列表统计展示</h3>
      <p>需求列表中会显示每条需求的测试统计信息：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>用例数</strong>：该需求关联的测试用例总数</li>
        <li><strong>通过/失败</strong>：最近一次执行的结果分布</li>
        <li><strong>回归通过率%</strong>：回归套件的总体通过率</li>
      </ul>
    </div>
  );
}

function CreateRelease() {
  return (
    <div className="space-y-6">
      <h2 id="create-release">创建发版</h2>
      <p>发版是需求的集合，用于将多个需求打包到一个发布批次中。</p>
      <div className="space-y-3">
        <Step number={1} title="进入发版计划页面">
          点击顶部导航栏的「发版计划」。
        </Step>
        <Step number={2} title="点击「新建发版」">
          填写发版名称（如 "v2.1.0"）、计划日期和描述。
        </Step>
        <Step number={3} title="关联需求">
          在发版详情页点击「添加需求」，从需求列表中选择要纳入发版的需求。
        </Step>
      </div>
    </div>
  );
}

function ManageRelease() {
  return (
    <div className="space-y-6">
      <h2 id="manage-release">管理发版需求</h2>
      <p>在发版详情页可以看到所有关联需求的列表，支持以下操作：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>添加需求</strong>：从现有需求中选择添加到发版</li>
        <li><strong>移除需求</strong>：从发版中移除不需要的需求</li>
        <li><strong>查看详情</strong>：点击需求跳转至详情页</li>
      </ul>
    </div>
  );
}

function ReleaseProgress() {
  return (
    <div className="space-y-6">
      <h2 id="release-progress">查看发版进度</h2>
      <p>发版详情页展示以下进度信息：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>需求总数</strong>：发版关联的需求数量</li>
        <li><strong>状态分布</strong>：各状态需求的数量和占比（待评审/设计中/开发中/已完成）</li>
        <li><strong>回归通过率</strong>：已完成需求的回归测试通过率</li>
        <li><strong>计划日期</strong>：发版计划上线时间</li>
      </ul>
    </div>
  );
}

function AIChat() {
  return (
    <div className="space-y-6">
      <h2 id="ai-chat">智能问答</h2>
      <p>AI 助手页面提供独立的对话界面，支持以下功能：</p>
      <div className="space-y-3">
        <FeatureListItem title="关联需求上下文">
          在对话开始前选择关联某个需求，AI 回答时会检索该需求的文档和元数据。
        </FeatureListItem>
        <FeatureListItem title="多轮对话">
          支持连续对话，AI 会记住上下文，可以针对之前的回答进行追问。
        </FeatureListItem>
        <FeatureListItem title="引用来源">
          AI 回答后会展示引用的文档来源，方便验证信息准确性。
        </FeatureListItem>
      </div>
    </div>
  );
}

function AIInsightDetail() {
  return (
    <div className="space-y-6">
      <h2 id="ai-insight-detail">需求洞察</h2>
      <p>AI 自动分析需求内容，生成以下类型的洞察：</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <InsightCard icon="🗃️" title="数据模型建议" desc="根据需求描述建议的数据库表结构和字段" />
        <InsightCard icon="🔄" title="流程分析" desc="业务流程的步骤和状态流转" />
        <InsightCard icon="🛡️" title="GSP 合规提示" desc="需求涉及的 GSP 法规条款和合规风险" />
        <InsightCard icon="⚠️" title="风险识别" desc="潜在的技术风险和实现难点" />
      </div>
    </div>
  );
}

function AIHistory() {
  return (
    <div className="space-y-6">
      <h2 id="ai-history">对话历史</h2>
      <p>AI 助手页面左侧的对话列表保存所有历史对话，支持：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>自动命名</strong>：新对话会自动根据首次提问内容生成标题</li>
        <li><strong>按需求分组</strong>：关联了需求的对话会显示需求编号</li>
        <li><strong>搜索</strong>：按对话标题搜索历史记录</li>
        <li><strong>删除</strong>：删除不需要的对话记录</li>
      </ul>

      <h3>思考过程</h3>
      <p>AI 回复消息上方会显示「已深度思考」折叠面板，展示 AI 的推理过程：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li>点击面板标题可展开/收起详细思考内容</li>
        <li>流式传输中显示「思考中…」，完成后显示「已深度思考」</li>
        <li>思考内容默认收起，展开后可查看完整推理链</li>
      </ul>
    </div>
  );
}

function AISkills() {
  return (
    <div className="space-y-6">
      <h2 id="ai-skills">AI 技能管理</h2>
      <p>平台预置了多种 AI 技能（Skill），每种技能定义了 AI 的角色、行为和专业领域：</p>

      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">技能</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">分类</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">用途</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['wm-architect', '方案设计', '生成数据模型、架构设计方案'],
              ['wm-analyst', '需求分析', '分析需求可行性、相似性、重复检测'],
              ['wm-assistant', '通用对话', '日常问答、知识问答'],
              ['wm-rag', 'RAG检索', '知识库检索、文档问答'],
              ['wm-planner', '发版规划', '发版工作量估算、排期建议'],
              ['wm-tester', '测试用例', 'AI 生成/补充测试用例'],
            ].map(([name, category, use], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-mono text-[13px] text-[var(--ink)]">{name}</td>
                <td className="py-2.5 px-3 text-[var(--ink)]">{category}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout type="info" title="自定义技能">
        ADMIN 用户可以在「设置 → AI Skills」页面创建自定义技能，定义专属系统提示词模板和分类。
      </Callout>
    </div>
  );
}

function ManualArticles() {
  return (
    <div className="space-y-6">
      <h2 id="manual-articles">知识文章</h2>
      <p>操作手册的知识文章由管理员维护，以 Markdown 格式编写，面向所有用户展示。</p>
      <h3>分类管理</h3>
      <p>文章按自定义功能分类组织（如 "入库管理"、"出库管理"、"库存管理" 等），分类由管理员在左侧边栏动态创建和编辑。</p>
      <h3>文章内容</h3>
      <p>支持 Markdown 全部语法：标题、列表、代码块、表格、图片、链接等。编辑时提供实时预览。</p>
    </div>
  );
}

function ManualDocs() {
  return (
    <div className="space-y-6">
      <h2 id="manual-docs">文档管理</h2>
      <p>管理员可在操作手册中上传文档文件（PDF、Word、Excel），所有用户可以预览和下载。</p>
      <h3>上传格式</h3>
      <div className="flex flex-wrap gap-2">
        {['.pdf', '.docx', '.xlsx', '.xls', '.md', '.txt'].map((ext) => (
          <span key={ext} className="px-3 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[13px] font-mono text-[var(--ink)]">
            {ext}
          </span>
        ))}
      </div>
      <p>单个文件最大 20MB。</p>
      <h3>预览方式</h3>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>PDF</strong>：内嵌 iframe 预览</li>
        <li><strong>Word</strong>：转换为 HTML 后内联渲染（与 Markdown 相同的样式）</li>
        <li><strong>Excel</strong>：转换为 HTML 表格后内联渲染</li>
      </ul>
    </div>
  );
}

function ManualLinks() {
  return (
    <div className="space-y-6">
      <h2 id="manual-links">外链导航</h2>
      <p>管理员可添加外部链接到操作手册，聚合常用参考资料和工具入口。</p>
      <p>外链以卡片形式展示，点击后在新标签页中打开目标 URL。</p>
    </div>
  );
}

function TeamRoles() {
  return (
    <div className="space-y-6">
      <h2 id="team-roles">角色说明</h2>
      <p>平台角色定义参见「角色与权限」章节。在团队管理页面中，管理员可以查看和修改用户的角色。</p>
    </div>
  );
}

function UserManagement() {
  return (
    <div className="space-y-6">
      <h2 id="user-management">用户管理</h2>
      <p>ADMIN 角色可在团队管理页面执行以下操作：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>查看用户列表</strong>：所有用户的用户名、昵称、角色、分组、状态</li>
        <li><strong>添加用户</strong>：创建新账号，设置用户名、密码、角色和分组</li>
        <li><strong>编辑用户</strong>：修改用户的角色、分组和昵称</li>
        <li><strong>停用/启用</strong>：停用用户后该用户无法登录</li>
        <li><strong>角色管理</strong>：在「角色」Tab 中查看/创建/编辑/删除角色，系统内置角色不可删除</li>
      </ul>

      <Callout type="warning" title="密码复杂度要求">
        创建或修改用户密码时，必须满足以下所有条件：
        <ul className="list-disc pl-4 mt-1 space-y-0.5">
          <li>长度不少于 8 位</li>
          <li>包含至少一个大写字母（A-Z）</li>
          <li>包含至少一个小写字母（a-z）</li>
          <li>包含至少一个数字（0-9）</li>
        </ul>
      </Callout>
    </div>
  );
}

function AIConfig() {
  return (
    <div className="space-y-6">
      <h2 id="ai-config">AI 模型配置</h2>
      <p>在设置页面的「AI 模型」Tab 中，可配置以下参数：</p>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">参数</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">说明</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">推荐值</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Model', 'AI 模型选择', '选择可用的 AI 模型'],
              ['Temperature', '回答创造性', '0.3-0.7（技术问答建议 0.3）'],
              ['Max Tokens', '最大回答长度', '4096'],
              ['Top P', '采样阈值', '0.9'],
              ['System Prompt', '系统提示词', '定义 AI 的角色和行为'],
            ].map(([param, desc, recommended], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-mono text-[13px] text-[var(--ink)]">{param}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{desc}</td>
                <td className="py-2.5 px-3 text-[13px] text-[var(--primary)]">{recommended}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AISkillsSettings() {
  return (
    <div className="space-y-6">
      <h2 id="ai-skills-settings">AI 技能管理</h2>
      <p>在设置页面的「AI Skills」Tab 中，管理员可以：</p>

      <h3>技能 CRUD</h3>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>创建技能</strong>：设置唯一标识（如 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] text-[var(--primary)]">wm-custom</code>）、显示名称、描述、分类和系统提示词模板</li>
        <li><strong>编辑技能</strong>：修改提示词模板（支持 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">{'{{title}}'}</code>、<code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">{'{{description}}'}</code> 等占位符），唯一标识创建后不可修改</li>
        <li><strong>启用/禁用</strong>：切换技能开关，禁用的技能不会出现在调用映射中</li>
        <li><strong>删除</strong>：永久删除技能及其关联映射</li>
      </ul>

      <h3>AI 调用映射</h3>
      <p>配置每个 AI 任务使用哪个技能，将任务映射到已启用的技能：</p>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">任务</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">默认技能</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['AI 生成设计方案', 'wm-architect'],
              ['AI 需求分析', 'wm-analyst'],
              ['AI 对话助手', 'wm-assistant'],
              ['RAG 知识检索', 'wm-rag'],
              ['发版工作量估算', 'wm-planner'],
              ['发版排程建议', 'wm-planner'],
              ['生成测试用例', 'wm-tester'],
            ].map(([task, skill], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 text-[var(--ink)] text-[13px]">{task}</td>
                <td className="py-2.5 px-3 font-mono text-[13px] text-[var(--primary)]">{skill}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout type="warning" title="注意">
        如果没有为某个任务配置技能映射，系统将使用硬编码的默认提示词。建议保持默认映射不变。
      </Callout>
    </div>
  );
}

function RAGSettings() {
  return (
    <div className="space-y-6">
      <h2 id="rag-settings">RAG 设置</h2>
      <p>RAG（检索增强生成）设置控制文档如何分块和检索：</p>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">参数</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">说明</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">默认值</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['分块大小 (MD)', 'Markdown 文档每块最大字符数', '3000'],
              ['分块大小 (文本)', '纯文本文档每块最大字符数', '2000'],
              ['重叠字符数', '相邻块之间的重叠字符数', '200'],
              ['检索窗口', '检索时返回的连续块范围字符数', '6000'],
              ['Top K', '向量检索返回的最大结果数', '10'],
              ['关键词命中数', '关键词检索最少命中词数', '按查询词数动态计算'],
            ].map(([param, desc, defaultVal], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-mono text-[13px] text-[var(--ink)]">{param}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{desc}</td>
                <td className="py-2.5 px-3 text-[13px]"><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] text-[var(--primary)]">{defaultVal}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KBManagement() {
  return (
    <div className="space-y-6">
      <h2 id="kb-management">知识库管理</h2>
      <p>在设置页面的「知识库」Tab 中，可管理多个知识库：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>创建知识库</strong>：设置名称、描述、文档类型、目录路径</li>
        <li><strong>目录扫描</strong>：配置扫描目录后，系统自动索引目录中的文件</li>
        <li><strong>路由示例</strong>：为知识库配置查询-分类映射，提升 AI 路由准确度</li>
        <li><strong>同步状态</strong>：查看知识库的最后同步时间和文档/分块数量</li>
        <li><strong>删除知识库</strong>：删除知识库及其所有文档和分块记录</li>
      </ul>

      <Callout type="info" title="内置知识库">
        平台默认创建多个知识库：<strong>「产品需求文档」</strong>（索引需求上传的 PRD/BRD/FSD）、<strong>「巴枪端分块」</strong>（索引巴枪扫描数据）、<strong>「操作手册」</strong>（索引操作手册的文章和文档）。
      </Callout>
    </div>
  );
}

function WorkflowSettings() {
  return (
    <div className="space-y-6">
      <h2 id="workflow-settings">工作流配置</h2>
      <p>工作流定义了需求状态之间的流转规则，确保状态变更符合业务流程规范。</p>

      <h3>创建工作流程</h3>
      <div className="space-y-3">
        <Step number={1} title="进入设置页">
          点击顶部导航「设置」→「工作流」Tab。
        </Step>
        <Step number={2} title="新建工作流">
          输入工作流名称（如"默认需求流程"），点击创建。
        </Step>
        <Step number={3} title="定义状态节点">
          添加状态节点（如"待评审"、"评审中"、"设计中"、"开发中"、"测试中"、"已完成"），可设置颜色、拖拽排序、标记起始/结束状态。
        </Step>
        <Step number={4} title="配置流转规则">
          在流转矩阵中，为每个状态勾选允许流转到的目标状态（复选框矩阵）。
        </Step>
      </div>

      <Callout type="info" title="多工作流支持">
        支持为不同用户组创建独立的工作流。每个组可以有自己的状态定义和流转规则。
      </Callout>

      <h3>工作流使用</h3>
      <p>工作流配置后，在以下场景生效：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>状态标签点击</strong>：状态流转对话框仅显示允许的目标状态</li>
        <li><strong>编辑需求</strong>：状态下拉框只展示当前状态允许的下一个状态</li>
        <li><strong>审计日志</strong>：每次状态变更记录到 ActivityLog</li>
      </ul>
    </div>
  );
}

function LoginAccount() {
  return (
    <div className="space-y-6">
      <h2 id="login-account">账号登录</h2>
      <p>访问平台首先需要使用用户名和密码登录。登录页支持「记住我」和「记住密码」两种便捷功能，下次访问时自动回填。</p>

      <h3 id="login-remember">记住我 / 记住密码</h3>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">选项</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">效果</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">存储位置</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['记住我', '下次打开登录页时自动填入用户名', 'localStorage'],
              ['记住密码', '同时保存密码，用户名和密码都自动回填（勾选时自动勾选「记住我」）', 'localStorage'],
            ].map(([opt, effect, storage], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-medium text-[var(--ink)]">{opt}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{effect}</td>
                <td className="py-2.5 px-3"><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] text-[var(--primary)]">{storage}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Callout type="info" title="联动说明">
        取消「记住我」时，「记住密码」也会自动取消；勾选「记住密码」时，「记住我」会自动勾选。
        下次登录成功后，凭据会按最新勾选状态更新（若取消则从 localStorage 删除）。
      </Callout>

      <h3 id="password-policy">密码规则</h3>
      <p>系统对密码有最低复杂度要求，创建账号或修改密码时必须满足：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li>长度 <strong>≥ 8 位</strong></li>
        <li>包含至少 1 个 <strong>大写字母</strong>（A-Z）</li>
        <li>包含至少 1 个 <strong>小写字母</strong>（a-z）</li>
        <li>包含至少 1 个 <strong>数字</strong>（0-9）</li>
      </ul>
      <Callout type="tip" title="示例">
        <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">Admin2026</code>、
        <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] ml-1">WmsReq#1</code> 均满足要求。
        <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] ml-1 line-through opacity-60">admin123</code> 因无大写字母不符合要求。
      </Callout>
    </div>
  );
}

function RequirementList() {
  return (
    <div className="space-y-6">
      <h2 id="requirement-list">需求列表</h2>
      <p>需求列表页以 TAPD 风格呈现，提供丰富的视觉标识和灵活的筛选能力。</p>

      <h3 id="req-list-filter">筛选栏</h3>
      <p>筛选区分为两行布局：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>第一行</strong>：优先级（多选）、需求类型（多选）、状态（多选）、搜索框</li>
        <li><strong>第二行</strong>：所属分类、负责人、所属模块（枚举下拉）、发版计划</li>
      </ul>
      <Callout type="info" title="分类计数动态刷新">
        左侧分类树旁的需求计数会随筛选条件（非分类本身）实时更新，父分类会递归汇总子分类的计数。
      </Callout>

      <h3 id="req-list-tags">优先级与类型标签</h3>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">类型</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">标识</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">说明</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['优先级文字标签', 'P0 紧急 / P1 高 / P2 中 / P3 低', '彩色背景，直接显示在优先级列'],
              ['需求类型徽章', 'R-需求 / B-缺陷 / I-改进 / T-任务', '彩色边框徽章，显示在标题前'],
              ['标题前缀', 'REQ / BUG / IMP / TSK', '对应需求/缺陷/改进/任务的编号前缀'],
            ].map(([type, tag, desc], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-medium text-[var(--ink)] text-[13px]">{type}</td>
                <td className="py-2.5 px-3 font-mono text-[12px] text-[var(--primary)]">{tag}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 id="req-list-more">更多操作</h3>
      <p>列表顶部「更多操作」下拉菜单提供以下功能：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>配置查询条件</strong>：自定义第二行筛选栏显示哪些筛选项（持久化到 <code className="px-1 py-0.5 bg-[var(--canvas)] rounded text-[12px]">localStorage</code>）</li>
        <li><strong>配置列显示</strong>：自定义表格列的显示/隐藏，包括自定义字段列</li>
        <li><strong>Excel 导入</strong>：下载 14 列模板 → 预览校验 → 确认导入；<code className="px-1 py-0.5 bg-[var(--canvas)] rounded text-[12px]">需求编码</code> 按填写值入库，并回填对应计数桶</li>
        <li><strong>Excel 导出</strong>：自选字段 + 当前筛选条件导出，列名与导入模板一致（支持「导出→再导入」）</li>
      </ul>
      <Callout type="tip" title="提示">
        列配置和查询条件配置均持久化存储，刷新页面后仍保留上次的配置。
      </Callout>
    </div>
  );
}

function ModuleConfig() {
  return (
    <div className="space-y-6">
      <h2 id="module-config">模块枚举配置</h2>
      <p>「所属模块」字段用于标记需求归属的业务功能模块（如入库、出库、库存、GSP 等）。管理员可在设置页面自定义模块选项列表。</p>

      <h3>配置入口</h3>
      <div className="space-y-3">
        <Step number={1} title="进入设置页">
          点击顶部导航「设置」，切换到「系统配置」Tab（或直接进入模块选项区域）。
        </Step>
        <Step number={2} title="编辑模块列表">
          在「所属模块选项」输入框中逐行输入模块名称，支持增删改顺序。
        </Step>
        <Step number={3} title="保存">
          点击「保存」，立即生效：需求创建/编辑表单中「所属模块」变为下拉选择；需求列表筛选栏同步显示模块筛选项。
        </Step>
      </div>

      <Callout type="info" title="说明">
        模块选项存储在 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px] text-[var(--primary)]">SystemConfig</code> 表中，键为 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">module_options</code>。
        未配置时，需求表单中「所属模块」显示为纯文本输入框（向下兼容历史数据）。
      </Callout>

      <Callout type="warning" title="注意">
        删除已有模块选项后，已使用该模块的历史需求数据不受影响，仍可正常查询；
        但编辑这些需求时，模块字段需重新选择有效选项。
      </Callout>
    </div>
  );
}

// ── Reusable UI Components ─────────────────────────────────────────

function Callout({ type, title, children }: { type: 'info' | 'warning' | 'tip'; title: string; children: React.ReactNode }) {
  const styles = {
    info: 'border-blue-200 bg-blue-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
    tip: 'border-green-200 bg-green-50/50',
  };
  const icons = { info: '💡', warning: '⚠️', tip: '✅' };

  return (
    <div className={`rounded-[var(--radius-md)] border p-4 ${styles[type]}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-lg shrink-0">{icons[type]}</span>
        <div>
          <p className="text-[13px] font-semibold text-[var(--ink)] mb-1">{title}</p>
          <div className="text-[13px] text-[var(--ink-muted-80)] leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] p-5 space-y-2">
      <span className="text-2xl">{icon}</span>
      <h3 className="text-[14px] font-semibold text-[var(--ink)]">{title}</h3>
      <p className="text-[13px] text-[var(--ink-muted-80)] leading-relaxed">{desc}</p>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-[var(--primary)] text-white text-[13px] font-medium flex items-center justify-center shrink-0">
          {number}
        </div>
        {children && <div className="w-px flex-1 bg-[var(--hairline)] mt-1" />}
      </div>
      <div className="pb-4">
        <p className="text-[14px] font-medium text-[var(--ink)]">{title}</p>
        {children && <p className="text-[13px] text-[var(--ink-muted-80)] mt-1 leading-relaxed">{children}</p>}
      </div>
    </div>
  );
}

function RoleCard({ name, label, color, permissions }: { name: string; label: string; color: string; permissions: string[] }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-[12px] font-medium border ${color}`}>{name}</span>
        <span className="text-[14px] font-semibold text-[var(--ink)]">{label}</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {permissions.map((p) => (
          <li key={p} className="flex items-center gap-1.5 text-[13px] text-[var(--ink-muted-80)]">
            <span className="text-[var(--primary)]">●</span> {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── 2026-06-08 新增章节 ─────────────────────────────────────────────

function BatchDelete() {
  return (
    <div className="space-y-6">
      <h2 id="batch-delete">批量删除</h2>
      <p>需求列表支持多选后一次性删除多条需求，避免逐条点击操作。所有删除均为软删除，可在「回收站」中恢复。</p>

      <h3>操作步骤</h3>
      <div className="space-y-3">
        <Step number={1} title="勾选需求">
          在需求列表表格左侧勾选框选择要删除的需求（可跨页勾选）。
        </Step>
        <Step number={2} title="点击批量删除">
          顶部操作栏出现「批量删除 (N)」按钮，N 为已选项数。
        </Step>
        <Step number={3} title="二次确认">
          系统弹出确认对话框，显示要删除的数量和标题摘要，避免误删。
        </Step>
        <Step number={4} title="查看结果">
          删除后自动刷新列表；如需恢复，进入「回收站」页还原。
        </Step>
      </div>

      <Callout type="warning" title="软删除 ≠ 物理删除">
        批量删除只是将需求的 <code className="px-1 py-0.5 bg-[var(--canvas)] rounded text-[12px]">isDeleted</code> 标志位设为 true，不会级联物理删除子任务/评论/附件等关联数据。彻底清理需进入回收站由 ADMIN 永久删除。
      </Callout>

      <Callout type="info" title="GSP 合规">
        软删除操作同样记录到审计日志（操作人、时间、原状态），满足 GSP 条款 04001-04003 的更改留痕要求。
      </Callout>
    </div>
  );
}

function RecycleBin() {
  return (
    <div className="space-y-6">
      <h2 id="recycle-bin">回收站</h2>
      <p>所有被软删除的需求都会进入回收站，可还原或彻底删除。回收站列表默认按删除时间倒序展示。</p>

      <h3>进入回收站</h3>
      <p>两种方式：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li>左侧导航栏「需求管理 → 回收站」</li>
        <li>访问 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">/app/requirements/trash</code> 直链</li>
      </ul>

      <h3>可用操作</h3>
      <div className="space-y-3">
        <Step number={1} title="单条还原">
          点击行尾「还原」按钮，将需求恢复到删除前的状态。
        </Step>
        <Step number={2} title="单条永久删除">
          <strong>仅 ADMIN 可见</strong>。点击「永久删除」会级联物理删除子任务/评论/附件/文档/日志/洞察等所有关联数据。
        </Step>
        <Step number={3} title="批量还原">
          勾选多条后点击「批量还原」，一次性恢复选中项。
        </Step>
        <Step number={4} title="批量永久删除">
          <strong>仅 ADMIN 可见</strong>。勾选多条后点击「批量永久删除」，配合二次确认对话框使用。
        </Step>
      </div>

      <Callout type="warning" title="永久删除不可恢复">
        永久删除是物理级联清理，操作前请确认需求不再需要。系统会弹出红色警告对话框，需输入确认词后才能执行。
      </Callout>

      <Callout type="info" title="GSP 合规">
        永久删除同样记录审计日志：操作人、时间、删除的需求 ID 列表，满足 GSP 条款 05805 的系统审计追踪要求。
      </Callout>

      <h3>软删除字段</h3>
      <p>需求表 (Requirement) 上有 3 个软删除字段：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">isDeleted</code> Boolean：是否已删除</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">deletedAt</code> DateTime?：删除时间</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">deletedBy</code> String?：操作人（username）</li>
      </ul>
    </div>
  );
}

function ReqTypeField() {
  return (
    <div className="space-y-6">
      <h2 id="req-type-field">需求类型字段</h2>
      <p>创建或编辑需求时，「需求类型」是一个<strong>独立的选择字段</strong>，不再仅由所选分类推断。这样即使分类根类型选错，需求本身也能标记正确的类型。</p>

      <h3>字段位置</h3>
      <p>在「创建需求」/「编辑需求」表单中，「需求类型」选择器位于「需求分类」上方，是必填项。</p>

      <h3>可选值</h3>
      <p>下拉数据来自 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">GET /api/v1/req-types</code>，仅展示 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">enabled=true</code> 的类型。系统默认提供 4 个类型：</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { code: 'REQUIREMENT', name: '需求', color: '#eff6ff', prefix: 'REQ' },
          { code: 'BUG', name: '缺陷', color: '#fef2f2', prefix: 'BUG' },
          { code: 'IMPROVEMENT', name: '改进', color: '#faf5ff', prefix: 'IMP' },
          { code: 'TASK', name: '任务', color: '#f0fdfa', prefix: 'TSK' },
        ].map((t) => (
          <DataSourceCard key={t.code} title={`${t.name} (${t.code})`} desc={`颜色 #${t.color.slice(1)} · prefix=${t.prefix}`} />
        ))}
      </div>

      <h3>与分类的关系</h3>
      <p>选择「需求类型」后，下方的「需求分类」下拉会自动过滤出该类型根下的所有分类。如果两者不一致（例如类型选「缺陷」、分类选在「需求」根下），提交时服务层会按「类型优先」逻辑写入需求的 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">reqTypeId</code>。</p>

      <Callout type="tip" title="何时修改类型">
        改类型时若启用了编码规则，<strong>新建</strong>需求的 type 字母段会变化；已存在需求的 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">reqNo</code> 不变。类型 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">prefix</code> 首字母即 typeLetter（默认 REQ→R、BUG→B、IMP→I、TSK→T）。
      </Callout>
    </div>
  );
}

function ReqTypeSettings() {
  return (
    <div className="space-y-6">
      <h2 id="req-type-settings">需求类型管理</h2>
      <p>「需求类型」是从硬编码的 4 个值（需求/缺陷/改进/任务）升级为可管理字典的产物。ADMIN 可在「设置 → 需求类型」中增删改、调整顺序、切换启用状态。</p>

      <h3 id="req-type-basics">类型字典与种子</h3>
      <p>系统启动时自动 seed 4 个默认类型（不可被删除的根类型），每个需求类型的字段包括：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">code</code> String unique — 编码（API 标识符，1-32 字符大写字母/数字/下划线）</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">displayName</code> String — 显示名（中文友好）</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">color</code> String — 标签颜色 (#RRGGBB)</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">prefix</code> String — 编码规则用首字母</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">sortOrder</code> Int — 列表排序</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">enabled</code> Boolean — 是否启用</li>
      </ul>

      <h3>典型操作</h3>
      <div className="space-y-3">
        <Step number={1} title="新增类型">
          点击「新增类型」，填写 code / displayName / color / prefix，保存后立即生效。
        </Step>
        <Step number={2} title="调整顺序">
          直接修改 sortOrder 或拖动行（按 sortOrder ASC 排序）。
        </Step>
        <Step number={3} title="启用/禁用">
          点击行尾开关即可切换，禁用后下拉框不再展示。
        </Step>
      </div>

      <h3 id="req-type-edit-code">修改编码的引用限制</h3>
      <Callout type="warning" title="改 code 会被引用数拦截">
        修改 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">code</code> 时，服务层会调用 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">countUserUsage</code> 检查：仅 <strong>未软删除</strong> 且引用了该 type 的 <strong>需求</strong> 才算引用。引用数为 0 时才能改 code。
      </Callout>
      <p>根分类的引用<strong>不</strong>计入（根分类通过 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">ensureRootCategories</code> 与 type 自动同步，不应阻塞 code 修改）。</p>

      <Callout type="tip" title="删除限制">
        删除类型时，只要还有需求或分类引用就会拒绝。需要先迁移引用、改 code、或将相关数据软删除后再删类型。
      </Callout>
    </div>
  );
}

function CategorySettings() {
  return (
    <div className="space-y-6">
      <h2 id="category-settings">需求分类与编码</h2>
      <p>ADMIN 在「设置 → 需求分类」维护业务分类树。启用自定义编码后，编号中的<strong>第 2、3 段</strong>来自此处配置的一级/二级模块 code。</p>

      <h3 id="category-tree">分类树结构</h3>
      <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] p-4 font-mono text-[13px] leading-relaxed text-[var(--ink)]">
        需求（类型根，不参与编码）<br />
        &nbsp;&nbsp;└─ 入库管理 RM（一级模块）<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ 收货 1001（二级模块）<br />
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└─ 抽样验收 1002（二级模块）
      </div>
      <p>缺陷 / 改进 / 任务 各有独立的类型根与下级模块，结构相同。</p>

      <h3 id="category-code">一级/二级模块 code</h3>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">层级</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">编码段</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">示例</th>
              <th className="text-left py-2 px-3 font-medium text-[var(--ink-muted-80)]">配置方式</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['类型根', '—', '需求 / 缺陷', '无需 code，不可删除'],
              ['一级模块', '第 2 段', 'RM（入库管理）', '铅笔图标编辑；可上下移调整顺序'],
              ['二级模块', '第 3 段', '1001（收货）', '铅笔图标编辑；同级按 code 自动排序'],
            ].map(([level, seg, example, how], i) => (
              <tr key={i} className="border-b border-[var(--divider-soft)]">
                <td className="py-2.5 px-3 font-medium text-[var(--ink)]">{level}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)]">{seg}</td>
                <td className="py-2.5 px-3 font-mono text-[12px] text-[var(--primary)]">{example}</td>
                <td className="py-2.5 px-3 text-[var(--ink-muted-80)] text-[13px]">{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout type="tip" title="code 格式">
        大写字母/数字开头，可含 <code className="px-1 py-0.5 bg-[var(--canvas)] rounded text-[12px]">_</code> 和 <code className="px-1 py-0.5 bg-[var(--canvas)] rounded text-[12px]">-</code>，长度 1-31；同级不可重复。
      </Callout>

      <h3 id="category-sort">排序规则</h3>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>类型根</strong>（需求/缺陷/改进/任务）：按手动 sortOrder</li>
        <li><strong>一级模块</strong>：按手动 sortOrder（支持上下移按钮）</li>
        <li><strong>二级模块</strong>：同一一级模块下按 code 自动排序（纯数字按数值，如 1001 &lt; 1002）</li>
      </ul>
      <Callout type="info" title="编辑体验">
        保存分类后树形展开状态会保留，不会全部收起；刷新数据时仅右上角显示「更新中」，不打断连续维护。
      </Callout>
    </div>
  );
}

function NumberRuleSettings() {
  return (
    <div className="space-y-6">
      <h2 id="number-rule-settings">需求编码规则</h2>
      <p>默认编号为 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">REQ-2026-001</code>（年份+全局序号）。启用后可使用 <strong>5 段式编码</strong>，序号按「选中分类 + 需求类型」独立计数。</p>

      <h3 id="number-rule-format">5 段式编码格式</h3>
      <p>完整格式：<code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">{'{prefix}-{一级模块code}-{二级模块code}-{typeLetter}-{seq}'}</code></p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <DataSourceCard title="prefix" desc="项目前缀（设置页配置）。例：HD" />
        <DataSourceCard title="一级模块 code" desc="第 2 段。例：RM = 入库管理（在需求分类中配置）" />
        <DataSourceCard title="二级模块 code" desc="第 3 段。例：1001 = 收货；仅选一级时为空 → HD-RM--R-001" />
        <DataSourceCard title="typeLetter" desc="需求类型 prefix 首字母。例：R（需求，prefix=REQ）" />
        <DataSourceCard title="seq" desc="序号，每桶独立累计。001-999 数字，1000+ 转 A01" />
      </div>
      <p>
        完整示例：<code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">HD-RM-1001-R-001</code>
        = 入库管理(RM) → 收货(1001) → 需求(R) → 第 1 号
      </p>

      <h3 id="number-rule-encode-seq">序列号编码 001 → A01</h3>
      <p>序号只增不减，每桶上限 3573。算法：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li>1-999 → <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">001</code> … <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">999</code></li>
        <li>1000-3573 → <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">A01</code> … <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">Z99</code></li>
        <li>超出 → 创建失败（避免冲突）</li>
      </ul>

      <h3 id="number-rule-counter">计数桶与导入</h3>
      <p>计数维度是 <strong>选中分类 + 需求类型</strong>，不是全局按类型。设置页「计数桶」表格展示各桶的已用/下次，例如：</p>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">HD-RM-1001-R</code> → 已用 3，下次 004</li>
        <li><code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">HD-RM-1002-R</code> → 已用 1，下次 002</li>
      </ul>
      <Callout type="info" title="Web 创建 vs Excel 导入">
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li><strong>页面创建</strong>：系统自动生成 seq，并自增对应计数桶</li>
          <li><strong>Excel 导入</strong>：按模板填写的「需求编码」原样入库，同时按编码末段回填计数桶</li>
        </ul>
      </Callout>

      <h3>设置页操作</h3>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li><strong>启用开关</strong>：勾选后立即保存，无需再点保存按钮</li>
        <li><strong>项目前缀</strong>：修改后点击「保存前缀」</li>
      </ul>

      <Callout type="warning" title="现有数据不重算">
        历史 <code className="px-1.5 py-0.5 bg-[var(--canvas)] rounded text-[12px]">REQ-2026-XXX</code> 编号不会被改写。关闭规则后新需求仍用旧格式；开启后用 5 段式（须先配好分类 code）。
      </Callout>

      <h3>校验规则（启用后）</h3>
      <ul className="list-disc pl-5 space-y-1 text-[var(--ink-muted-80)]">
        <li>不能选择类型根节点创建需求</li>
        <li>一级模块 code 必填；选二级时二级 code 也必填</li>
        <li>code 在「设置 → 需求分类」中维护，与需求类型字典的 code 无关</li>
      </ul>
    </div>
  );
}

function DataSourceCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] p-3.5">
      <p className="text-[13px] font-medium text-[var(--ink)]">{title}</p>
      <p className="text-[12px] text-[var(--ink-muted-80)] mt-0.5">{desc}</p>
    </div>
  );
}

function InsightCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] p-3.5">
      <span className="text-xl">{icon}</span>
      <p className="text-[13px] font-medium text-[var(--ink)] mt-1">{title}</p>
      <p className="text-[12px] text-[var(--ink-muted-80)] mt-0.5">{desc}</p>
    </div>
  );
}

function FeatureListItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] p-3.5">
      <p className="text-[13px] font-medium text-[var(--ink)]">{title}</p>
      <p className="text-[13px] text-[var(--ink-muted-80)] mt-1 leading-relaxed">{children}</p>
    </div>
  );
}

function EmptyContent() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-4xl mb-3">📄</p>
      <p className="text-[15px] font-medium text-[var(--ink)]">内容待补充</p>
      <p className="text-[13px] text-[var(--ink-muted-80)] mt-1">该章节的内容正在编写中...</p>
    </div>
  );
}

// ── Main Page Component ────────────────────────────────────────────

const SIDEBAR_WIDTH = 260;
const TOC_WIDTH = 220;

export function HelpCenterPage() {
  const [activeSection, setActiveSection] = useState('what-is-wmos');
  const [activeSectionGroup, setActiveSectionGroup] = useState('overview');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(DOC_SECTIONS.map(s => s.id)));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Navigate to a section
  const navigateTo = (sectionGroupId: string, subSectionId: string) => {
    setActiveSectionGroup(sectionGroupId);
    setActiveSection(subSectionId);
    setMobileSidebarOpen(false);
    // Scroll content to top
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const currentSection = DOC_SECTIONS.find(s => s.id === activeSectionGroup);
  const tocItems = TOC_MAP[activeSectionGroup] || [];

  return (
    <div className="flex min-h-screen bg-[var(--canvas-parchment)]">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        className="lg:hidden fixed top-[56px] left-3 z-40 p-2 rounded-lg bg-[var(--canvas)] border border-[var(--hairline)] shadow-sm"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
      >
        <Menu size={16} />
      </button>

      {/* Left Sidebar */}
      <aside
        className={`fixed lg:relative lg:shrink-0 top-[48px] lg:top-0 left-0 bottom-0 z-40 lg:z-auto bg-[var(--canvas)] border-r border-[var(--hairline)] overflow-y-auto transition-transform duration-200 lg:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="p-4">
          {/* Search Box */}
          <div className="relative mb-4">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted-48)]" />
            <input
              type="text"
              placeholder="搜索文档..."
              className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40"
            />
          </div>

          {/* Section Tree */}
          <nav className="space-y-0.5">
            {DOC_SECTIONS.map((section) => {
              const isExpanded = expandedGroups.has(section.id);
              const isActive = activeSectionGroup === section.id;

              return (
                <div key={section.id}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(section.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] text-[13px] text-left transition-colors ${
                      isActive
                        ? 'bg-[var(--primary)]/8 text-[var(--primary)] font-medium'
                        : 'text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <span className="text-sm">{section.icon}</span>
                    <span className="flex-1 truncate">{section.title}</span>
                    {section.children && (
                      isExpanded
                        ? <ChevronDown size={14} className="shrink-0 opacity-50" />
                        : <ChevronRight size={14} className="shrink-0 opacity-50" />
                    )}
                  </button>

                  {isExpanded && section.children && (
                    <div className="ml-4 border-l border-[var(--hairline)] pl-2 space-y-0.5">
                      {section.children.map((child) => {
                        const isChildActive = activeSection === child.id;
                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => navigateTo(section.id, child.id)}
                            className={`w-full text-left px-2 py-1 rounded text-[12px] transition-colors ${
                              isChildActive
                                ? 'text-[var(--primary)] font-medium bg-[var(--primary)]/6'
                                : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)] hover:bg-[var(--canvas-parchment)]'
                            }`}
                          >
                            {child.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className="flex-1 min-w-0 grid grid-cols-1 xl:grid-cols-[1fr_220px]"
      >
        {/* Content Area */}
        <div
          ref={contentRef}
          className="flex-1 min-w-0"
        >
            <div className="max-w-[800px] mx-auto px-6 py-8 lg:px-10">
              {/* Breadcrumb-like section indicator */}
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-muted-48)] mb-4">
                <span>{currentSection?.icon}</span>
                <span>{currentSection?.title}</span>
                <ChevronRight size={12} />
                <span className="text-[var(--ink-muted-80)] font-medium">
                  {DOC_SECTIONS.find(s => s.id === activeSectionGroup)?.children?.find(c => c.id === activeSection)?.title}
                </span>
              </div>

              {/* Page Title */}
              <h1 className="text-[24px] font-semibold text-[var(--ink)] mb-1 leading-tight">
                {DOC_SECTIONS.find(s => s.id === activeSectionGroup)?.children?.find(c => c.id === activeSection)?.title}
              </h1>
              <div className="h-px bg-[var(--hairline)] my-5" />

              {/* Content */}
              <DocContent sectionId={activeSection} />
            </div>
        </div>

        {/* Right Sidebar — Table of Contents */}
        <aside
            className="hidden xl:block shrink-0 border-l border-[var(--hairline)] bg-[var(--canvas)]"
            style={{ width: TOC_WIDTH }}
          >
            <div className="sticky top-[48px] p-4 max-h-[calc(100vh-48px)] overflow-y-auto">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-muted-80)] mb-3">
                <Hash size={12} />
                <span>本页目录</span>
              </div>
              <nav className="space-y-0.5">
                {tocItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className={`block text-[12px] transition-colors py-0.5 border-l-2 border-transparent pl-3 ${
                      item.level === 2
                        ? 'ml-3 text-[var(--ink-muted-48)] hover:text-[var(--ink-muted-80)]'
                        : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {item.title}
                  </a>
                ))}
              </nav>

              {tocItems.length === 0 && (
                <p className="text-[12px] text-[var(--ink-muted-48)]">暂无目录信息</p>
              )}
            </div>
          </aside>
      </main>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 p-2.5 rounded-full bg-[var(--primary)] text-white shadow-lg hover:bg-[var(--primary-focus)] transition-colors"
        >
          <ArrowUp size={16} />
        </button>
      )}
    </div>
  );
}
