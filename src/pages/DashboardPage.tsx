import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Card, SimpleGrid, Text, Badge, Table, Group, Stack, Box, Paper, ThemeIcon } from '@mantine/core'

interface Stats {
  fileCount: number; todoCount: number; memberCount: number; messageCount: number
  llmConfigured: boolean; appVersion: string
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ fileCount: 0, todoCount: 0, memberCount: 0, messageCount: 0, llmConfigured: false, appVersion: '0.1.0' })
  const [config, setConfig] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([api('GET', '/config/status'), api('GET', '/config')])
      .then(([s, c]) => { setStats(s as Stats); setConfig(c as Record<string, string>) })
      .catch(() => {})
  }, [])

  const statItems = [
    { label: '文件', value: stats.fileCount, sub: '已索引', color: 'blue',
      icon: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M4 2h5l4 4v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M9 2v4h4" /></svg> },
    { label: '待办', value: stats.todoCount, sub: '未完成', color: 'orange',
      icon: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="8" r="6" /><path d="M6 8l1.5 1.5L10.5 6" /></svg> },
    { label: '成员', value: stats.memberCount, sub: '已绑定', color: 'teal',
      icon: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="5" r="3" /><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" /></svg> },
    { label: '消息', value: stats.messageCount, sub: '总对话', color: 'violet',
      icon: <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 3h12v8H5l-3 3V3z" /></svg> },
  ]

  const statusItems = [
    { label: 'AI 模型', detail: config.llmModel || '未配置', ok: stats.llmConfigured },
    { label: 'OCR 引擎', detail: config.imageAi === 'ocr' ? 'Tesseract.js' : '关闭', ok: config.imageAi === 'ocr' },
    { label: '微信连接', detail: `${stats.memberCount} 个成员`, ok: stats.memberCount > 0 },
    { label: '定时任务', detail: '每分钟检查待办', ok: true },
  ]

  const quickLinks = [
    { label: '添加家庭成员', desc: '绑定微信后即可通过聊天交互', href: 'members' },
    { label: '配置 AI 模型', desc: '设置 API Key 让 Agent 具备思考能力', href: 'ai-config' },
    { label: '扫描文件目录', desc: '索引文档和图片，建立知识库', href: 'scan-config' },
  ]

  return (
    <Box p="md">
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          {statItems.map((item) => (
            <Card key={item.label} withBorder radius="md" p="md">
              <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{item.label}</Text>
                <ThemeIcon variant="light" color={item.color} size="sm" radius="md">
                  {item.icon}
                </ThemeIcon>
              </Group>
              <Text size="xl" fw={700} lh={1.2}>{item.value}</Text>
              <Text size="xs" c="dimmed" mt={2}>{item.sub}</Text>
            </Card>
          ))}
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Card withBorder radius="md">
            <Card.Section withBorder inheritPadding py="xs">
              <Text fw={600} size="sm">系统状态</Text>
            </Card.Section>
            <Table>
              <Table.Tbody>
                {statusItems.map((row) => (
                  <Table.Tr key={row.label}>
                    <Table.Td>
                      <Group gap="sm">
                        <Box w={8} h={8} style={{ borderRadius: '50%', backgroundColor: row.ok ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)' }} />
                        <Text size="sm" fw={500}>{row.label}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group justify="flex-end" gap="sm">
                        <Text size="xs" c="dimmed">{row.detail}</Text>
                        <Badge color={row.ok ? 'teal' : 'red'} variant="light" size="sm">
                          {row.ok ? '正常' : '异常'}
                        </Badge>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>

          <Card withBorder radius="md">
            <Card.Section withBorder inheritPadding py="xs">
              <Text fw={600} size="sm">快速操作</Text>
            </Card.Section>
            <Card.Section inheritPadding py="md">
              <Stack gap="xs">
                {quickLinks.map((a) => (
                  <Paper key={a.label} p="sm" radius="md" withBorder style={{ cursor: 'pointer' }}>
                    <Group gap="sm">
                      <ThemeIcon variant="light" size="sm" radius="md">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4l4 4-4 4" /></svg>
                      </ThemeIcon>
                      <Box>
                        <Text size="sm" fw={500}>{a.label}</Text>
                        <Text size="xs" c="dimmed">{a.desc}</Text>
                      </Box>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Card.Section>
          </Card>
        </SimpleGrid>
      </Stack>
    </Box>
  )
}
