import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { api } from '../lib/api'
import { Card, TextInput, Button, Group, Stack, Text, Box, Alert } from '@mantine/core'
import { notifications } from '@mantine/notifications'

export function AIConfigPage() {
  const [apiKey, setApiKey] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [model, setModel] = useState('')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    api<Record<string, string>>('GET', '/config').then((c) => {
      setApiKey(c.llmApiKey || '')
      setApiBase(c.llmBaseUrl || '')
      setModel(c.llmModel || '')
    }).catch(() => {})
  }, [])

  const save = async () => {
    try {
      await api('POST', '/config', { llmApiKey: apiKey, llmBaseUrl: apiBase, llmModel: model })
      setSaved(true)
      notifications.show({ message: '配置已保存，正在重启后端...', color: 'green' })
      // 重启后端让新配置生效
      try { await invoke<string>('restart_node_backend') } catch {}
      setTimeout(() => setSaved(false), 2000)
    } catch { notifications.show({ message: '保存失败', color: 'red' }) }
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // Save first so the backend has latest config
      await api('POST', '/config', { llmApiKey: apiKey, llmBaseUrl: apiBase, llmModel: model })
      const msg = await invoke<string>('test_ai_connection')
      setTestResult({ ok: true, msg })
      notifications.show({ message: msg, color: 'green' })
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || '测试失败'
      setTestResult({ ok: false, msg })
      notifications.show({ message: msg, color: 'red' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Box p="xl" maw={560}>
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">API 配置</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Stack gap="md">
            <TextInput
              label="API Key"
              description="支持 DeepSeek / Qwen / OpenAI 等兼容 API"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
              placeholder="sk-xxxxxxxxxx"
            />
            <TextInput
              label="API 地址"
              value={apiBase}
              onChange={(e) => setApiBase(e.currentTarget.value)}
              placeholder="https://api.deepseek.com"
            />
            <TextInput
              label="模型名称"
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
              placeholder="deepseek-v4-flash"
            />
            {testResult && (
              <Alert color={testResult.ok ? 'green' : 'red'} variant="light" radius="md">
                {testResult.msg}
              </Alert>
            )}
            <Group>
              <Button onClick={save}>保存配置</Button>
              <Button variant="default" loading={testing} onClick={testConnection}>
                {testing ? '测试中...' : '测试连接'}
              </Button>
              {saved && <Text size="xs" c="teal" fw={500}>✓ 已保存</Text>}
            </Group>
          </Stack>
        </Card.Section>
      </Card>
    </Box>
  )
}
