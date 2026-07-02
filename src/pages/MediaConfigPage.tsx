import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Card, Select, Button, Group, Stack, Text, Box, Divider } from '@mantine/core'
import { notifications } from '@mantine/notifications'

export function MediaConfigPage() {
  const [imageAi, setImageAi] = useState<string | null>('off')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api<Record<string, string>>('GET', '/config').then((c) => setImageAi(c.imageAi || 'off')).catch(() => {})
  }, [])

  const save = async () => {
    try {
      await api('POST', '/config', { imageAi })
      setSaved(true)
      notifications.show({ message: '配置已保存', color: 'green' })
      setTimeout(() => setSaved(false), 2000)
    } catch { notifications.show({ message: '保存失败', color: 'red' }) }
  }

  return (
    <Box p="md" maw={640}>
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">图片处理</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Stack gap="md">
            <Select
              label="识别模式"
              description="OCR 模式会自动识别图片中的文字并建立索引"
              value={imageAi}
              onChange={setImageAi}
              data={[
                { value: 'off', label: '仅保存（不识别文字）' },
                { value: 'ocr', label: 'OCR 文字识别（Tesseract.js）' },
              ]}
            />
            <Divider />
            <Group>
              <Button onClick={save}>保存配置</Button>
              {saved && <Text size="xs" c="teal" fw={500}>✓ 已保存</Text>}
            </Group>
          </Stack>
        </Card.Section>
      </Card>
    </Box>
  )
}
