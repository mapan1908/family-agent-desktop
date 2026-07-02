import { useState, useEffect } from 'react'
import { api, escapeHtml } from '../lib/api'
import { Card, Button, Avatar, Text, Box, Group, Stack, Center } from '@mantine/core'
interface Message { id: number; name: string; text: string; reply?: string; created_at: number }

export function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([])

  const load = () => api<Message[]>('GET', '/messages?limit=50').then(setMessages).catch(() => {})
  useEffect(() => { load() }, [])

  return (
    <Box p="md" maw={720}>
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Text fw={600} size="sm">聊天记录</Text>
            <Button variant="default" size="xs" onClick={load} leftSection={
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8a6 6 0 1 1 1 3.5" /><path d="M2 14V8h6" /></svg>
            }>
              刷新
            </Button>
          </Group>
        </Card.Section>
        {messages.length === 0 && (
          <Card.Section inheritPadding py="xl">
            <Center>
              <Stack align="center" gap="xs">
                <Avatar color="gray" radius="xl" size="md">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 3h12v8H5l-3 3V3z" /></svg>
                </Avatar>
                <Text size="sm" c="dimmed">暂无消息</Text>
              </Stack>
            </Center>
          </Card.Section>
        )}
        {messages.map((m) => (
          <Card.Section key={m.id} withBorder inheritPadding py="sm">
            <Group gap="sm" mb={6}>
              <Avatar color="blue" radius="xl" size="sm">
                {(m.name || '?')[0]}
              </Avatar>
              <Text size="sm" fw={500}>{m.name || '?'}</Text>
              <Text size="xs" c="dimmed">{new Date(m.created_at).toLocaleString('zh-CN')}</Text>
            </Group>
            <Box ml={36}>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{escapeHtml(m.text || '')}</Text>
              {m.reply && (
                <Box mt="xs" ml={2} pl="sm" style={{ borderLeft: '2px solid var(--mantine-color-blue-3)' }}>
                  <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>{escapeHtml(m.reply)}</Text>
                </Box>
              )}
            </Box>
          </Card.Section>
        ))}
      </Card>
    </Box>
  )
}
