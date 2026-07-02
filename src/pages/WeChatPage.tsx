import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Card, Button, Text, Box, Stack, Center, Avatar, Group, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'

interface Member { id: number; name: string; role: string }
interface BindState { status: string; qr?: string; memberName?: string; memberId?: number }

export function WeChatPage() {
  const [status, setStatus] = useState<BindState>({ status: 'unknown' })
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMember, setSelectedMember] = useState<string | null>(null)

  useEffect(() => {
    api<Member[]>('GET', '/members').then(setMembers).catch(() => {})
    // 轮询绑定状态
    const timer = setInterval(() => {
      api<BindState>('GET', '/wechat/status').then(setStatus).catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  const startBind = async () => {
    if (!selectedMember) {
      notifications.show({ message: '请先选择一个成员', color: 'orange' })
      return
    }
    const member = members.find(m => m.id === parseInt(selectedMember))
    if (!member) return
    try {
      await api('POST', '/wechat/bind', { memberId: member.id, memberName: member.name })
      notifications.show({ message: '正在生成二维码...', color: 'blue' })
    } catch { notifications.show({ message: '请求失败', color: 'red' }) }
  }

  const unbind = async (memberId: number, memberName: string) => {
    if (!confirm(`确认解绑「${memberName}」的微信？`)) return
    try {
      await api('POST', '/wechat/unbind', { memberId })
      notifications.show({ message: `已解绑 ${memberName}`, color: 'green' })
      // 刷新成员列表
      api<Member[]>('GET', '/members').then(setMembers).catch(() => {})
    } catch { notifications.show({ message: '解绑失败', color: 'red' }) }
  }

  // 已绑定成员列表（从 members API 拿不到 wxid 状态，用 bot 状态判断）
  const [botStates, setBotStates] = useState<Record<string, { memberName: string; userId?: string }>>({})
  useEffect(() => {
    api<Record<string, { memberName: string; userId?: string }>>('GET', '/wechat/bots').then(setBotStates).catch(() => {})
  }, [status])

  const boundMembers = Object.entries(botStates).filter(([, v]) => v.userId)

  return (
    <Box p="md" maw={640}>
      <Stack gap="md">
        <Card withBorder radius="md">
          <Card.Section withBorder inheritPadding py="xs">
            <Text fw={600} size="sm">绑定微信</Text>
          </Card.Section>
          <Card.Section inheritPadding py="md">
            {status.status === 'qr' && status.qr && (
              <Center py="md">
                <Stack align="center" gap="sm">
                  <img
                    src={status.qr}
                    style={{ width: 192, height: 192, borderRadius: 12, border: '1px solid var(--mantine-color-gray-3)' }}
                    alt="QR"
                  />
                  <Text size="sm" c="dimmed">请用「{status.memberName}」的微信扫描</Text>
                </Stack>
              </Center>
            )}
            {status.status !== 'qr' && (
              <Stack gap="md">
                <Select
                  label="选择成员"
                  placeholder="选择要绑定微信的成员"
                  data={members.map(m => ({ value: String(m.id), label: m.name }))}
                  value={selectedMember}
                  onChange={setSelectedMember}
                />
                <Group>
                  <Button onClick={startBind} disabled={!selectedMember}>生成绑定码</Button>
                </Group>
              </Stack>
            )}
          </Card.Section>
        </Card>

        {boundMembers.length > 0 && (
          <Card withBorder radius="md">
            <Card.Section withBorder inheritPadding py="xs">
              <Text fw={600} size="sm">已绑定</Text>
            </Card.Section>
            <Card.Section inheritPadding py="md">
              <Stack gap="sm">
                {boundMembers.map(([memberId, info]) => (
                  <Group key={memberId} justify="space-between">
                    <Group gap="sm">
                      <Avatar color="teal" radius="xl" size="sm">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8l3 3 5-5" /></svg>
                      </Avatar>
                      <Box>
                        <Text size="sm" fw={500}>{info.memberName}</Text>
                        <Text size="xs" c="dimmed">已连接</Text>
                      </Box>
                    </Group>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => unbind(parseInt(memberId), info.memberName)}
                    >
                      解绑
                    </Button>
                  </Group>
                ))}
              </Stack>
            </Card.Section>
          </Card>
        )}
      </Stack>
    </Box>
  )
}
