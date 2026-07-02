import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Card, TextInput, Select, Button, Table, Avatar, Group, Stack, Text, Box, Divider, Center, ActionIcon, Tooltip } from '@mantine/core'
import { notifications } from '@mantine/notifications'

interface Member { id: number; name: string; role: string }

const ROLE_LABELS: Record<string, string> = { parent: '家长', member: '成员', child: '孩子' }

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<string | null>('parent')

  const load = () => api<Member[]>('GET', '/members').then(setMembers).catch(() => {})
  useEffect(() => { load() }, [])

  const addMember = async () => {
    if (!newName.trim()) return
    try {
      await api('POST', '/members', { name: newName.trim(), role: newRole })
      setNewName('')
      load()
      notifications.show({ message: '成员已添加', color: 'green' })
    } catch { notifications.show({ message: '添加失败', color: 'red' }) }
  }

  const deleteMember = async (id: number, name: string) => {
    if (!confirm(`确认删除成员「${name}」？`)) return
    try {
      await api('DELETE', `/members/${id}`)
      load()
      notifications.show({ message: `已删除 ${name}`, color: 'green' })
    } catch { notifications.show({ message: '删除失败', color: 'red' }) }
  }

  return (
    <Box p="md" maw={640}>
      <Card withBorder radius="md">
        <Card.Section withBorder inheritPadding py="xs">
          <Text fw={600} size="sm">成员列表</Text>
        </Card.Section>
        <Card.Section inheritPadding py="md">
          <Stack gap="md">
            {members.length === 0 && (
              <Center py="md">
                <Text size="sm" c="dimmed">还没有成员，添加一个吧</Text>
              </Center>
            )}
            {members.length > 0 && (
              <Table>
                <Table.Tbody>
                  {members.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>
                        <Group gap="sm">
                          <Avatar color="blue" radius="xl" size="sm">
                            {m.name[0]}
                          </Avatar>
                          <Box>
                            <Text size="sm" fw={500}>{m.name}</Text>
                            <Text size="xs" c="dimmed">{ROLE_LABELS[m.role] || m.role}</Text>
                          </Box>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group justify="flex-end" gap="xs">
                          <Tooltip label="删除成员">
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              size="sm"
                              onClick={() => deleteMember(m.id, m.name)}
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" /></svg>
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <Divider />
            <Group gap="xs">
              <TextInput
                placeholder="成员名字"
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMember()}
                style={{ flex: 1 }}
              />
              <Select
                data={[
                  { value: 'parent', label: '家长' },
                  { value: 'member', label: '成员' },
                  { value: 'child', label: '孩子' },
                ]}
                value={newRole}
                onChange={setNewRole}
                w={100}
              />
              <Button onClick={addMember}>添加</Button>
            </Group>
          </Stack>
        </Card.Section>
      </Card>
    </Box>
  )
}
