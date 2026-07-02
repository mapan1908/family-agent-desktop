import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { Card, TextInput, NumberInput, Button, Group, Stack, Text, Box } from '@mantine/core'
import { notifications } from '@mantine/notifications'

async function openInExplorer(dirPath: string) {
  try {
    await revealItemInDir(dirPath)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '打开失败'
    notifications.show({ message: msg, color: 'red' })
  }
}

export function DataConfigPage() {
  const [dataDir, setDataDir] = useState('./data')
  const [port, setPort] = useState<number | string>(3099)

  useEffect(() => {
    api<Record<string, string>>('GET', '/config').then((c) => {
      setDataDir(c.dataDir || './data')
      setPort(c.port || '3099')
    }).catch(() => {})
  }, [])

  return (
    <Box p="xl" maw={560} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">数据目录</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Stack gap="md">
            <Stack gap={4}>
              <Text size="sm" fw={500}>DATA_DIR</Text>
              <Text size="xs" c="dimmed">所有数据存储在此目录下。路径由系统自动管理，不支持修改。</Text>
              <Group gap="xs">
                <TextInput flex={1} value={dataDir} disabled />
                <Button variant="default" onClick={() => openInExplorer(dataDir)}>打开</Button>
              </Group>
            </Stack>
            <NumberInput
              label="监听端口"
              description="Web 面板和 API 的监听端口，修改后需重启服务"
              value={port}
              onChange={setPort}
              disabled
            />
          </Stack>
        </Card.Section>
      </Card>
    </Box>
  )
}
