import { useState } from 'react'
import {
  AppShell,
  NavLink,
  Group,
  Text,
  Title,
  Stack,
  Box,
  ActionIcon,
  Tooltip,
  UnstyledButton,
  useMantineColorScheme,
  ScrollArea,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { DashboardPage } from '../pages/DashboardPage'
import { AIConfigPage } from '../pages/AIConfigPage'
import { MediaConfigPage } from '../pages/MediaConfigPage'
import { ScanConfigPage } from '../pages/ScanConfigPage'
import { DataConfigPage } from '../pages/DataConfigPage'
import { MembersPage } from '../pages/MembersPage'
import { WeChatPage } from '../pages/WeChatPage'
import { MessagesPage } from '../pages/MessagesPage'

type Page = 'dashboard' | 'ai-config' | 'media-config' | 'scan-config' | 'data-config' | 'members' | 'wechat' | 'messages'

const PAGE_META: Record<Page, { title: string; desc: string }> = {
  'dashboard':    { title: '仪表盘', desc: '系统状态总览' },
  'ai-config':    { title: 'AI 模型', desc: '配置 LLM API Key 和模型参数' },
  'media-config': { title: '媒体处理', desc: '图片 OCR 和语音识别设置' },
  'scan-config':  { title: '扫描目录', desc: '管理文件索引路径' },
  'data-config':  { title: '数据存储', desc: '数据目录和端口配置' },
  'members':      { title: '家庭成员', desc: '管理家庭成员和权限' },
  'wechat':       { title: '微信绑定', desc: '绑定微信账号接收消息' },
  'messages':     { title: '聊天记录', desc: '浏览历史对话' },
}

interface NavItem { id: Page; label: string; icon: React.ReactNode }

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: '概览',
    items: [
      { id: 'dashboard', label: '仪表盘', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg> },
    ],
  },
  {
    title: '配置',
    items: [
      { id: 'ai-config', label: 'AI 模型', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3" /><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3.05 3.05l1.41 1.41m7.08 7.08l1.41 1.41M3.05 12.95l1.41-1.41m7.08-7.08l1.41-1.41" /></svg> },
      { id: 'media-config', label: '媒体处理', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2" /><circle cx="6" cy="6" r="1.5" /><path d="M14 10l-3-3-5 5" /></svg> },
      { id: 'scan-config', label: '扫描目录', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 6V3a1 1 0 0 1 1-1h3l2 2h4a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6z" /></svg> },
      { id: 'data-config', label: '数据存储', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="8" cy="4" rx="6" ry="2" /><path d="M2 4v8c0 1.1 2.7 2 6 2s6-.9 6-2V4" /><path d="M2 8c0 1.1 2.7 2 6 2s6-.9 6-2" /></svg> },
    ],
  },
  {
    title: '管理',
    items: [
      { id: 'members', label: '家庭成员', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="3" /><path d="M2 14c0-2.2 1.8-4 4-4s4 1.8 4 4" /><circle cx="12" cy="5" r="2" /><path d="M12 9c1.5 0 3 1.2 3 3" /></svg> },
      { id: 'wechat', label: '微信绑定', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="2" width="10" height="12" rx="2" /><line x1="6" y1="12" x2="10" y2="12" /></svg> },
      { id: 'messages', label: '聊天记录', icon: <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v8H5l-3 3V3z" /><line x1="5" y1="6" x2="11" y2="6" /><line x1="5" y1="9" x2="9" y2="9" /></svg> },
    ],
  },
]

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard': return <DashboardPage />
    case 'ai-config': return <AIConfigPage />
    case 'media-config': return <MediaConfigPage />
    case 'scan-config': return <ScanConfigPage />
    case 'data-config': return <DataConfigPage />
    case 'members': return <MembersPage />
    case 'wechat': return <WeChatPage />
    case 'messages': return <MessagesPage />
    default: return <DashboardPage />
  }
}

function SunIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="3" /><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3.05 3.05l1.41 1.41m7.08 7.08l1.41 1.41M3.05 12.95l1.41-1.41m7.08-7.08l1.41-1.41" /></svg>
}

function MoonIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 8.5A5.5 5.5 0 0 1 7.5 3 5.5 5.5 0 1 0 13 8.5z" /></svg>
}

function CollapseIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 4l-4 4 4 4" /></svg>
}


const NAVBAR_EXPANDED = 260
const NAVBAR_COLLAPSED = 64

export function AppShellLayout() {
  const [page, setPage] = useState<Page>('dashboard')
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const [expanded, { toggle: toggleExpanded }] = useDisclosure(true)

  const meta = PAGE_META[page]
  const navWidth = expanded ? NAVBAR_EXPANDED : NAVBAR_COLLAPSED

  return (
    <AppShell
      navbar={{ width: navWidth, breakpoint: 0 }}
      padding={0}
      h="100vh"
      transitionDuration={200}
    >
      <AppShell.Navbar p={0}>
        {/* Logo + collapse toggle */}
        <Box px={expanded ? 'md' : 8} py="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
          {expanded ? (
            <Group gap="sm" justify="space-between">
              <Group gap="sm">
                <Box w={32} h={32} style={{
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--mantine-color-blue-6), var(--mantine-color-blue-8))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2"><path d="M8 2L2 6v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6L8 2z" /><path d="M6 14V9h4v5" /></svg>
                </Box>
                <Stack gap={0}>
                  <Text size="sm" fw={600}>家庭 Agent</Text>
                  <Text size="xs" c="dimmed">v0.1.0</Text>
                </Stack>
              </Group>
              <Tooltip label="收起" position="right">
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggleExpanded}>
                  <CollapseIcon />
                </ActionIcon>
              </Tooltip>
            </Group>
          ) : (
            <Stack gap="xs" align="center">
              <Tooltip label="家庭 Agent" position="right">
                <Box w={36} h={36} style={{
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--mantine-color-blue-6), var(--mantine-color-blue-8))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }} onClick={toggleExpanded}>
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2"><path d="M8 2L2 6v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6L8 2z" /><path d="M6 14V9h4v5" /></svg>
                </Box>
              </Tooltip>
            </Stack>
          )}
        </Box>

        {/* Navigation */}
        <AppShell.Section grow component={ScrollArea} py="sm" px={expanded ? 'md' : 6}>
          {NAV_SECTIONS.map((section) => (
            <Stack key={section.title} gap={2} mb="sm">
              {expanded && (
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" lts="0.1em" px="xs" mb={4}>
                  {section.title}
                </Text>
              )}
              {section.items.map((item) => {
                const active = page === item.id
                if (expanded) {
                  return (
                    <NavLink
                      key={item.id}
                      label={item.label}
                      leftSection={item.icon}
                      active={active}
                      onClick={() => setPage(item.id)}
                      variant={active ? 'filled' : 'subtle'}
                      styles={{ root: { borderRadius: 8 } }}
                    />
                  )
                }
                return (
                  <Tooltip key={item.id} label={item.label} position="right">
                    <UnstyledButton
                      onClick={() => setPage(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 44, height: 36, margin: '2px auto',
                        borderRadius: 8, transition: 'background 0.15s',
                        background: active ? 'var(--mantine-color-filled)' : 'transparent',
                        color: active ? 'var(--mantine-color-filled-color)' : 'var(--mantine-color-dimmed)',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--mantine-color-default-hover)' }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      {item.icon}
                    </UnstyledButton>
                  </Tooltip>
                )
              })}
            </Stack>
          ))}
        </AppShell.Section>

        {/* Bottom bar */}
        <Group justify={expanded ? 'space-between' : 'center'} px={expanded ? 'md' : 8} py="sm"
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          {expanded && <Text size="xs" c="dimmed">family-agent</Text>}
          <Tooltip label={colorScheme === 'dark' ? '亮色模式' : '暗色模式'} position="right">
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={toggleColorScheme}>
              {colorScheme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Navbar>

      <AppShell.Main display="flex" style={{ flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box h={64} px="xl" pb="xs" display="flex"
          style={{ alignItems: 'flex-end', borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
        >
          <Stack gap={2}>
            <Title order={4} fw={600} lh={1.2}>{meta.title}</Title>
            <Text size="xs" c="dimmed" lh={1.2}>{meta.desc}</Text>
          </Stack>
        </Box>

        {/* Content */}
        <Box flex={1} style={{ overflowY: 'auto' }}>
          <PageContent page={page} />
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}
