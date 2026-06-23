import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createOpenCordApiClient,
  type ServerHealth,
} from '@opencord/api-client'
import {
  INITIAL_REALTIME_STATUS,
  realtimeUrlForServer,
  type RealtimeConnectionStatus,
} from '@opencord/realtime'
import {
  activeServerConnection,
  createDefaultServerConnectionState,
  loadServerConnectionState,
  removeServerConnection,
  saveServerConnectionState,
  switchServerConnection,
  upsertServerConnection,
  type ServerConnection,
} from '@opencord/server-connections'

import './App.css'

type HealthState = { status: 'checking' } | ServerHealth

type Space = {
  id: string
  name: string
  initials: string
  unread: boolean
  mentions: number
}

type Channel = {
  id: string
  spaceId: string
  name: string
  topic: string
  category: string
  canSend: boolean
  unread: boolean
  private: boolean
}

type ChatMessage = {
  id: string
  channelId: string
  author: string
  role: string
  time: string
  body: string
  own: boolean
  attachments: MessageAttachment[]
  edited?: boolean
}

type MessageAttachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  previewUrl?: string
}

type Member = {
  id: string
  name: string
  role: string
  presence: 'online' | 'idle' | 'offline'
}

const initialSpaces: Space[] = [
  { id: 'opencord', name: 'OpenCord', initials: 'OC', unread: true, mentions: 2 },
  { id: 'platform', name: 'Platform', initials: 'PF', unread: false, mentions: 0 },
  { id: 'design', name: 'Design', initials: 'DS', unread: true, mentions: 0 },
]

const initialChannels: Channel[] = [
  {
    id: 'general',
    spaceId: 'opencord',
    name: 'general',
    topic: 'Daily product coordination and chat core development.',
    category: 'Text channels',
    canSend: true,
    unread: true,
    private: false,
  },
  {
    id: 'announcements',
    spaceId: 'opencord',
    name: 'announcements',
    topic: 'Read-only release notes and operational notices.',
    category: 'Text channels',
    canSend: false,
    unread: false,
    private: false,
  },
  {
    id: 'backend',
    spaceId: 'opencord',
    name: 'backend',
    topic: 'Rust API, permissions, realtime, and storage.',
    category: 'Engineering',
    canSend: true,
    unread: false,
    private: false,
  },
  {
    id: 'moderators',
    spaceId: 'opencord',
    name: 'moderators',
    topic: 'Private review queue for permission and abuse handling.',
    category: 'Engineering',
    canSend: true,
    unread: false,
    private: true,
  },
]

const initialMessages: ChatMessage[] = [
  {
    id: 'm1',
    channelId: 'general',
    author: 'Thanet',
    role: 'Owner',
    time: '09:14',
    body: 'Welcome to OpenCord. The first chat core is coming together: auth, spaces, channels, messages, permissions, and realtime.',
    own: false,
    attachments: [],
  },
  {
    id: 'm2',
    channelId: 'general',
    author: 'Mira',
    role: 'Product',
    time: '09:22',
    body: 'The web client should feel familiar for Discord users but calmer for company work.',
    own: false,
    attachments: [],
  },
  {
    id: 'm3',
    channelId: 'general',
    author: 'You',
    role: 'Maintainer',
    time: '09:31',
    body: 'I am wiring the Phase 01 shell so the backend work has a usable surface.',
    own: true,
    attachments: [],
  },
  {
    id: 'm4',
    channelId: 'announcements',
    author: 'OpenCord',
    role: 'System',
    time: '08:00',
    body: 'Channel permissions are enabled. Members can view announcements but cannot send messages here.',
    own: false,
    attachments: [],
  },
]

const members: Member[] = [
  { id: 'u1', name: 'Thanet', role: 'Owners', presence: 'online' },
  { id: 'u2', name: 'You', role: 'Maintainers', presence: 'online' },
  { id: 'u3', name: 'Mira', role: 'Product', presence: 'idle' },
  { id: 'u4', name: 'Alex', role: 'Engineering', presence: 'online' },
  { id: 'u5', name: 'Nok', role: 'Engineering', presence: 'offline' },
]

export default function App() {
  const [serverConnections, setServerConnections] = useState(() =>
    loadBrowserServerConnectionState(),
  )
  const activeConnection =
    activeServerConnection(serverConnections) ??
    activeServerConnection(createDefaultServerConnectionState())!
  const [serverURL, setServerURL] = useState(activeConnection.baseUrl)
  const [serverDisplayName, setServerDisplayName] = useState('')
  const [health, setHealth] = useState<HealthState>({ status: 'checking' })
  const [realtimeStatus] = useState<RealtimeConnectionStatus>(INITIAL_REALTIME_STATUS)
  const [spaces] = useState(initialSpaces)
  const [channels, setChannels] = useState(initialChannels)
  const [messages, setMessages] = useState(initialMessages)
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialSpaces[0].id)
  const [selectedChannelId, setSelectedChannelId] = useState(initialChannels[0].id)
  const [composerText, setComposerText] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([])
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null)

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]
  const visibleChannels = channels.filter((channel) => channel.spaceId === selectedSpace.id)
  const selectedChannel =
    visibleChannels.find((channel) => channel.id === selectedChannelId) ?? visibleChannels[0]
  const channelMessages = messages.filter((message) => message.channelId === selectedChannel.id)
  const groupedMembers = useMemo(() => groupMembersByRole(members), [])
  const realtimeURL = useMemo(() => safeRealtimeURL(activeConnection.baseUrl), [activeConnection.baseUrl])

  async function checkServer(targetURL = activeConnection.baseUrl) {
    setHealth({ status: 'checking' })
    try {
      const result = await createOpenCordApiClient({ baseUrl: targetURL }).health()
      setHealth(result)
      return result
    } catch (error) {
      const result = {
        status: 'offline',
        message: error instanceof Error ? error.message : 'Unable to reach server',
      } satisfies ServerHealth
      setHealth(result)
      return result
    }
  }

  useEffect(() => {
    void checkServer(activeConnection.baseUrl)
  }, [])

  useEffect(() => {
    saveBrowserServerConnectionState(serverConnections)
  }, [serverConnections])

  async function submitServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetURL = serverURL
    const result = await checkServer(targetURL)
    setServerConnections((current) =>
      upsertServerConnection(current, {
        baseUrl: targetURL,
        displayName: serverDisplayName,
        serverVersion: result.status === 'online' ? result.version : 'unknown',
      }),
    )
    setServerDisplayName('')
  }

  function selectServerConnection(connection: ServerConnection) {
    setServerConnections((current) => switchServerConnection(current, connection.id))
    setServerURL(connection.baseUrl)
    setServerDisplayName('')
    void checkServer(connection.baseUrl)
  }

  function deleteServerConnection(connection: ServerConnection) {
    const next = removeServerConnection(serverConnections, connection.id)
    const nextActive = activeServerConnection(next)
    setServerConnections(next)
    if (nextActive) {
      setServerURL(nextActive.baseUrl)
      void checkServer(nextActive.baseUrl)
    }
  }

  function selectSpace(spaceId: string) {
    setSelectedSpaceId(spaceId)
    const firstChannel = channels.find((channel) => channel.spaceId === spaceId)
    if (firstChannel) {
      setSelectedChannelId(firstChannel.id)
      setPendingAttachments([])
    }
  }

  function addChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = normalizeChannelName(newChannelName)
    if (!name) {
      return
    }

    const id = `${name}-${Date.now()}`
    const channel: Channel = {
      id,
      spaceId: selectedSpace.id,
      name,
      topic: 'New channel created locally. API persistence comes next.',
      category: 'Text channels',
      canSend: true,
      unread: false,
      private: false,
    }
    setChannels((current) => [...current, channel])
    setSelectedChannelId(channel.id)
    setNewChannelName('')
    setShowChannelForm(false)
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = composerText.trim()
    if ((!body && pendingAttachments.length === 0) || !selectedChannel.canSend) {
      return
    }

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        channelId: selectedChannel.id,
        author: 'You',
        role: 'Maintainer',
        time: 'now',
        body,
        own: true,
        attachments: pendingAttachments,
      },
    ])
    setComposerText('')
    setPendingAttachments([])
  }

  function attachFiles(files: FileList | null) {
    if (!files || !selectedChannel.canSend) {
      return
    }

    const attachments = Array.from(files).map((file) => ({
      id: `local-attachment-${Date.now()}-${file.name}`,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      previewUrl: imagePreviewUrl(file),
    }))
    setPendingAttachments((current) => [...current, ...attachments].slice(0, 10))
  }

  function removePendingAttachment(attachmentId: string) {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMessage) {
      return
    }

    const body = editingMessage.body.trim()
    if (!body) {
      return
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === editingMessage.id ? { ...message, body, edited: true } : message,
      ),
    )
    setEditingMessage(null)
  }

  function deleteMessage(messageId: string) {
    setMessages((current) => current.filter((message) => message.id !== messageId))
  }

  return (
    <main className="app-shell">
      <aside className="space-rail" aria-label="Space rail">
        <button className="home-button" type="button" aria-label="Home">
          OC
        </button>
        <div className="space-stack">
          {spaces.map((space) => (
            <button
              key={space.id}
              className={`space-button ${space.id === selectedSpace.id ? 'is-active' : ''}`}
              type="button"
              aria-label={space.name}
              onClick={() => selectSpace(space.id)}
            >
              <span>{space.initials}</span>
              {space.unread ? <i className="unread-dot" aria-hidden="true" /> : null}
              {space.mentions > 0 ? (
                <strong className="mention-badge" aria-label={`${space.mentions} mentions`}>
                  {space.mentions}
                </strong>
              ) : null}
            </button>
          ))}
        </div>
        <button className="rail-action" type="button" aria-label="Add space">
          +
        </button>
      </aside>

      <nav className="channel-sidebar" aria-label="Channel navigation">
        <div className="server-card">
          <div>
            <strong>{activeConnection.displayName}</strong>
            <span>{activeConnection.baseUrl}</span>
          </div>
          <StatusBadge health={health} />
        </div>

        <form className="server-form" onSubmit={submitServer}>
          <label htmlFor="server-display-name">Server display name</label>
          <input
            id="server-display-name"
            name="server-display-name"
            value={serverDisplayName}
            onChange={(event) => setServerDisplayName(event.target.value)}
            placeholder={activeConnection.displayName}
          />
          <label htmlFor="server-url">Server URL</label>
          <div>
            <input
              id="server-url"
              name="server-url"
              type="url"
              value={serverURL}
              onChange={(event) => setServerURL(event.target.value)}
            />
            <button type="submit" aria-label="Add server">
              Add
            </button>
          </div>
        </form>

        <section className="server-connections" aria-label="Server connections">
          <h2>Servers</h2>
          {serverConnections.connections.map((connection) => (
            <div
              key={connection.id}
              className={`server-connection-row ${
                connection.id === activeConnection.id ? 'is-active' : ''
              }`}
            >
              <button
                type="button"
                aria-label={`Switch to ${connection.displayName}`}
                onClick={() => selectServerConnection(connection)}
              >
                <strong>{connection.displayName}</strong>
                <span>{connection.baseUrl}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${connection.displayName}`}
                onClick={() => deleteServerConnection(connection)}
              >
                Remove
              </button>
            </div>
          ))}
        </section>

        <button
          className="create-channel-button"
          type="button"
          onClick={() => setShowChannelForm((current) => !current)}
        >
          Create channel
        </button>

        {showChannelForm ? (
          <form className="channel-form" onSubmit={addChannel}>
            <label htmlFor="new-channel-name">New channel name</label>
            <div>
              <input
                id="new-channel-name"
                value={newChannelName}
                onChange={(event) => setNewChannelName(event.target.value)}
              />
              <button type="submit">Add channel</button>
            </div>
          </form>
        ) : null}

        <div className="channel-groups">
          {groupChannels(visibleChannels).map(([category, categoryChannels]) => (
            <section key={category} className="channel-group">
              <h2>{category}</h2>
              {categoryChannels.map((channel) => (
                <button
                  key={channel.id}
                  className={`channel-row ${channel.id === selectedChannel.id ? 'is-selected' : ''}`}
                  type="button"
                  aria-label={`# ${channel.name}`}
                  onClick={() => setSelectedChannelId(channel.id)}
                >
                  <span aria-hidden="true">#</span>
                  <span>{channel.name}</span>
                  {channel.unread ? <i aria-hidden="true" /> : null}
                </button>
              ))}
            </section>
          ))}
        </div>

        <div className="user-footer">
          <div className="avatar">Y</div>
          <div>
            <strong>You</strong>
            <span>Online</span>
          </div>
          <button type="button" aria-label="User settings">
            Set
          </button>
        </div>
      </nav>

      <section className="chat-panel" aria-label="Selected channel">
        <header className="channel-header">
          <div>
            <h1># {selectedChannel.name}</h1>
            <p>{selectedChannel.topic}</p>
          </div>
          <div className="header-actions" aria-label="Channel tools">
            <button type="button" aria-label="Search messages">
              Search
            </button>
            <button type="button" aria-label="Toggle members">
              Panel
            </button>
          </div>
        </header>

        <section className="message-timeline" aria-label="Message timeline">
          {channelMessages.length === 0 ? (
            <div className="empty-state">No messages yet. Start the channel.</div>
          ) : (
            channelMessages.map((message) => (
              <article key={message.id} className="message-card">
                <div className="message-avatar" aria-hidden="true">
                  {initialsFor(message.author)}
                </div>
                <div className="message-body">
                  <header>
                    <strong>{message.author}</strong>
                    <span>{message.role}</span>
                    <time>{message.time}</time>
                    {message.edited ? <em>edited</em> : null}
                  </header>
                  <p>{message.body}</p>
                  <AttachmentList attachments={message.attachments} />
                  {message.own ? (
                    <div className="message-actions">
                      <button
                        type="button"
                        aria-label="Edit message"
                        onClick={() => setEditingMessage({ id: message.id, body: message.body })}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label="Delete message"
                        onClick={() => deleteMessage(message.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>

        {selectedChannel.canSend ? (
          <div className="typing-line" data-realtime-url={realtimeURL}>
            {composerText.trim() ? 'You are typing...' : realtimeStatusText(realtimeStatus)}
          </div>
        ) : (
          <div className="permission-banner">You can view this channel but cannot send messages.</div>
        )}

        {editingMessage ? (
          <form className="edit-bar" onSubmit={saveEdit}>
            <label htmlFor="edit-message-text">Edit message text</label>
            <input
              id="edit-message-text"
              value={editingMessage.body}
              onChange={(event) =>
                setEditingMessage((current) =>
                  current ? { ...current, body: event.target.value } : current,
                )
              }
            />
            <button type="submit">Save edit</button>
            <button type="button" onClick={() => setEditingMessage(null)}>
              Cancel
            </button>
          </form>
        ) : null}

        <form className="composer" onSubmit={sendMessage}>
          {pendingAttachments.length > 0 ? (
            <div className="pending-attachments" aria-label="Pending attachments">
              {pendingAttachments.map((attachment) => (
                <div key={attachment.id} className="pending-attachment">
                  <AttachmentSummary attachment={attachment} />
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.fileName}`}
                    onClick={() => removePendingAttachment(attachment.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <label className="attach-button" title="Attach file">
            <span aria-hidden="true">+</span>
            <input
              aria-label="Attach file"
              type="file"
              multiple
              disabled={!selectedChannel.canSend}
              onChange={(event) => {
                attachFiles(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
          </label>
          <textarea
            aria-label="Message composer"
            placeholder={`Message #${selectedChannel.name}`}
            value={composerText}
            disabled={!selectedChannel.canSend}
            onChange={(event) => setComposerText(event.target.value)}
          />
          <button
            type="submit"
            disabled={
              !selectedChannel.canSend ||
              (!composerText.trim() && pendingAttachments.length === 0)
            }
          >
            Send message
          </button>
        </form>
      </section>

      <aside className="members-panel" aria-label="Members">
        <header>
          <strong>Members</strong>
          <span>{members.filter((member) => member.presence !== 'offline').length} online</span>
        </header>
        {groupedMembers.map(([role, roleMembers]) => (
          <section key={role} className="member-group">
            <h2>{role}</h2>
            {roleMembers.map((member) => (
              <div key={member.id} className="member-row">
                <span className={`presence-dot is-${member.presence}`} aria-hidden="true" />
                <span>{member.name}</span>
              </div>
            ))}
          </section>
        ))}
      </aside>
    </main>
  )
}

function StatusBadge({ health }: { health: HealthState }) {
  if (health.status === 'checking') {
    return <div className="status-badge is-checking">Checking API</div>
  }

  if (health.status === 'online') {
    return (
      <div className="status-badge is-online">
        <span>API online</span>
        <strong>{health.version}</strong>
      </div>
    )
  }

  return (
    <div className="status-badge is-offline">
      <span>API offline</span>
      <strong>{health.message}</strong>
    </div>
  )
}

function AttachmentList({ attachments }: { attachments: MessageAttachment[] }) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="message-attachments">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="message-attachment">
          {attachment.previewUrl ? (
            <img src={attachment.previewUrl} alt="" className="attachment-preview" />
          ) : null}
          <AttachmentSummary attachment={attachment} />
        </div>
      ))}
    </div>
  )
}

function AttachmentSummary({ attachment }: { attachment: MessageAttachment }) {
  return (
    <div className="attachment-summary">
      <strong>{attachment.fileName}</strong>
      <span className="attachment-meta">
        <span>{attachment.contentType}</span>
        <span>{formatBytes(attachment.sizeBytes)}</span>
      </span>
    </div>
  )
}

function groupChannels(channels: Channel[]) {
  return Array.from(
    channels.reduce((groups, channel) => {
      groups.set(channel.category, [...(groups.get(channel.category) ?? []), channel])
      return groups
    }, new Map<string, Channel[]>()),
  )
}

function groupMembersByRole(memberList: Member[]) {
  return Array.from(
    memberList.reduce((groups, member) => {
      groups.set(member.role, [...(groups.get(member.role) ?? []), member])
      return groups
    }, new Map<string, Member[]>()),
  )
}

function imagePreviewUrl(file: File) {
  if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') {
    return undefined
  }

  return URL.createObjectURL(file)
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  const kib = sizeBytes / 1024
  if (kib < 1024) {
    return `${kib.toFixed(kib >= 10 ? 0 : 1)} KiB`
  }

  const mib = kib / 1024
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`
}

function safeRealtimeURL(serverURL: string) {
  try {
    return realtimeUrlForServer(serverURL)
  } catch {
    return undefined
  }
}

function realtimeStatusText(status: RealtimeConnectionStatus) {
  switch (status) {
    case 'connecting':
      return 'Realtime connecting'
    case 'open':
      return 'Realtime connected'
    case 'error':
    case 'closed':
      return 'Realtime disconnected'
    case 'idle':
      return 'Realtime ready'
  }
}

function normalizeChannelName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9- ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function loadBrowserServerConnectionState() {
  if (typeof window === 'undefined') {
    return createDefaultServerConnectionState()
  }

  return loadServerConnectionState(window.localStorage)
}

function saveBrowserServerConnectionState(
  state: ReturnType<typeof createDefaultServerConnectionState>,
) {
  if (typeof window === 'undefined') {
    return
  }

  saveServerConnectionState(window.localStorage, state)
}
