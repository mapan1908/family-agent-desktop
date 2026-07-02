import { useState, useEffect } from 'react'
import { api, apiStream } from '../lib/api'
import { Card, Button, Group, Stack, Text, Box, Divider, ActionIcon, Progress } from '@mantine/core'
import { notifications } from '@mantine/notifications'

// Tauri dialog 只在桌面窗口可用，浏览器里 fallback 成 prompt
async function pickDirectory(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true, multiple: false, title: '选择目录' })
    return selected && typeof selected === 'string' ? selected : null
  } catch {
    const input = prompt('请输入目录路径:')
    return input?.trim() || null
  }
}

interface ScanProgress {
  phase: 'idle' | 'scanning' | 'cleanup' | 'done' | 'error'
  total: number
  inserted: number
  skipped: number
  removed: number
  errors: number
  currentDir: string
  dirFileCount: number
  message: string
}

const INITIAL_PROGRESS: ScanProgress = {
  phase: 'idle', total: 0, inserted: 0, skipped: 0, removed: 0, errors: 0, currentDir: '', dirFileCount: 0, message: '',
}

export function ScanConfigPage() {
  const [paths, setPaths] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<ScanProgress>(INITIAL_PROGRESS)

  useEffect(() => {
    api<Record<string, string>>('GET', '/config').then((c) => {
      setPaths((c.scanPaths || '').split(',').map((s: string) => s.trim()).filter(Boolean))
    }).catch(() => {})
  }, [])

  const addFolder = async () => {
    const selected = await pickDirectory()
    if (selected && !paths.includes(selected)) {
      setPaths([...paths, selected])
    }
  }

  const removePath = (i: number) => setPaths(paths.filter((_, idx) => idx !== i))

  const save = async () => {
    try {
      await api('POST', '/config', { scanPaths: paths.join(',') })
      setSaved(true)
      notifications.show({ message: '配置已保存', color: 'green' })
      setTimeout(() => setSaved(false), 2000)
    } catch { notifications.show({ message: '保存失败', color: 'red' }) }
  }

  const triggerScan = async () => {
    setScanning(true)
    setProgress({ ...INITIAL_PROGRESS, phase: 'scanning' })

    try {
      // 先保存路径配置
      await api('POST', '/config', { scanPaths: paths.join(',') })

      // SSE 流式扫描
      await apiStream('/scan/stream', {
        dir: (data) => {
          setProgress(prev => ({
            ...prev,
            phase: 'scanning',
            currentDir: data.path as string,
            dirFileCount: (data.fileCount as number) || prev.dirFileCount,
          }))
        },
        progress: (data) => {
          setProgress(prev => ({
            ...prev,
            total: (data.total as number) || prev.total,
            inserted: (data.inserted as number) || prev.inserted,
            skipped: (data.skipped as number) || prev.skipped,
            errors: (data.errors as number) || prev.errors,
          }))
        },
        cleanup: (data) => {
          setProgress(prev => ({
            ...prev,
            phase: 'cleanup',
            removed: (data.removed as number) ?? prev.removed,
          }))
        },
        done: (data) => {
          setProgress({
            phase: 'done',
            total: (data.total as number) || 0,
            inserted: (data.inserted as number) || 0,
            skipped: (data.skipped as number) || 0,
            removed: (data.removed as number) || 0,
            errors: (data.errors as number) || 0,
            currentDir: '',
            dirFileCount: 0,
            message: (data.message as string) || '扫描完成',
          })
          notifications.show({ message: data.message as string, color: 'green' })
        },
        error: (data) => {
          setProgress(prev => ({ ...prev, phase: 'error', message: (data.message as string) || '扫描失败' }))
          notifications.show({ message: (data.message as string) || '扫描失败', color: 'red' })
        },
      })
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : '扫描失败')
      setProgress(prev => ({ ...prev, phase: 'error', message: msg }))
      notifications.show({ message: msg, color: 'red' })
    } finally {
      setScanning(false)
    }
  }

  const progressPercent = progress.total > 0
    ? Math.round(((progress.inserted + progress.skipped) / progress.total) * 100)
    : 0

  return (
    <Box p="xl" maw={640}>
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">扫描目录</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Stack gap="md">
            {paths.length === 0 && (
              <Text size="sm" c="dimmed">未配置扫描目录，点击下方添加</Text>
            )}
            {paths.map((p, i) => (
              <Group key={i} justify="space-between">
                <Text size="sm" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{p}</Text>
                <ActionIcon color="red" variant="subtle" size="sm" onClick={() => removePath(i)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" /></svg>
                </ActionIcon>
              </Group>
            ))}
            <Divider />
            <Group>
              <Button variant="default" onClick={addFolder}>添加目录</Button>
              <Button onClick={save}>保存配置</Button>
              {saved && <Text size="xs" c="teal" fw={500}>✓ 已保存</Text>}
            </Group>

            <Divider />

            <Group>
              <Button onClick={triggerScan} loading={scanning} disabled={paths.length === 0}>
                {scanning ? '扫描中...' : '开始扫描'}
              </Button>
            </Group>

            {/* 进度区域 */}
            {progress.phase !== 'idle' && (
              <Card withBorder radius="sm" bg="var(--mantine-color-gray-0)">
                <Stack gap="xs">
                  {progress.phase === 'scanning' && (
                    <>
                      <Text size="xs" c="dimmed">
                        扫描中: {progress.currentDir.split('/').pop() || progress.currentDir}
                        {progress.dirFileCount > 0 && ` (${progress.dirFileCount} 个文件)`}
                      </Text>
                      <Progress value={progressPercent} size="sm" animated />
                    </>
                  )}
                  {progress.phase === 'cleanup' && (
                    <Text size="xs" c="dimmed">清理孤儿记录中...</Text>
                  )}

                  <Group gap="md">
                    <Text size="xs">总计: <strong>{progress.total}</strong></Text>
                    <Text size="xs" c="teal">新增: <strong>{progress.inserted}</strong></Text>
                    <Text size="xs" c="dimmed">跳过: <strong>{progress.skipped}</strong></Text>
                    {progress.removed > 0 && (
                      <Text size="xs" c="orange">清理: <strong>{progress.removed}</strong></Text>
                    )}
                    {progress.errors > 0 && (
                      <Text size="xs" c="red">错误: <strong>{progress.errors}</strong></Text>
                    )}
                  </Group>

                  {progress.phase === 'done' && (
                    <Text size="xs" c="teal" fw={500}>✓ {progress.message}</Text>
                  )}
                  {progress.phase === 'error' && (
                    <Text size="xs" c="red">✗ {progress.message}</Text>
                  )}
                </Stack>
              </Card>
            )}
          </Stack>
        </Card.Section>
      </Card>
    </Box>
  )
}
