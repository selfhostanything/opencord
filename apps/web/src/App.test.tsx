import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

describe('OpenCord web chat UI', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: 'test-version' }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    window.localStorage?.clear?.()
    vi.unstubAllGlobals()
  })

  it('renders a Discord-like workspace with rail, channels, messages, composer, and members', async () => {
    render(<App />)

    expect(screen.getByLabelText('Space rail')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Channel navigation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '# general' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message timeline')).toHaveTextContent('Welcome to OpenCord')
    expect(screen.getByLabelText('Message composer')).toBeInTheDocument()
    expect(screen.getByText('Realtime ready')).toHaveAttribute(
      'data-realtime-url',
      'ws://localhost:8080/ws',
    )
    expect(screen.getByRole('complementary', { name: 'Members' })).toHaveTextContent('Product')

    await waitFor(() => {
      expect(screen.getByText('API online')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/healthz', {
      headers: { Accept: 'application/json' },
    })
  })

  it('sends, edits, and deletes a local message in the selected channel', async () => {
    render(<App />)

    await userEvent.type(screen.getByLabelText('Message composer'), 'Shipping the chat UI')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    const timeline = screen.getByLabelText('Message timeline')
    expect(timeline).toHaveTextContent('Shipping the chat UI')

    const sentMessage = within(timeline).getByText('Shipping the chat UI').closest('article')
    expect(sentMessage).not.toBeNull()

    await userEvent.click(within(sentMessage!).getByRole('button', { name: 'Edit message' }))
    await userEvent.clear(screen.getByLabelText('Edit message text'))
    await userEvent.type(screen.getByLabelText('Edit message text'), 'Shipping the polished chat UI')
    await userEvent.click(screen.getByRole('button', { name: 'Save edit' }))

    expect(timeline).toHaveTextContent('Shipping the polished chat UI')

    await userEvent.click(within(sentMessage!).getByRole('button', { name: 'Delete message' }))
    expect(timeline).not.toHaveTextContent('Shipping the polished chat UI')
  })

  it('attaches a local file preview to a sent message', async () => {
    render(<App />)

    const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('Attach file'), file)
    expect(screen.getByText('diagram.png')).toBeInTheDocument()
    expect(screen.getByLabelText('Pending attachments')).toHaveTextContent('11 B')

    await userEvent.type(screen.getByLabelText('Message composer'), 'See attached diagram')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    const timeline = screen.getByLabelText('Message timeline')
    const sentMessage = within(timeline).getByText('See attached diagram').closest('article')
    expect(sentMessage).not.toBeNull()
    expect(within(sentMessage!).getByText('diagram.png')).toBeInTheDocument()
    expect(within(sentMessage!).getByText('image/png')).toBeInTheDocument()
    expect(screen.queryByLabelText('Pending attachments')).not.toBeInTheDocument()
  })

  it('removes a pending attachment before sending', async () => {
    render(<App />)

    await userEvent.upload(
      screen.getByLabelText('Attach file'),
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    )
    expect(screen.getByText('notes.txt')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }))

    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
  })

  it('creates and selects a new text channel', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
    await userEvent.type(screen.getByLabelText('New channel name'), 'launch-room')
    await userEvent.click(screen.getByRole('button', { name: 'Add channel' }))

    await userEvent.click(screen.getByRole('button', { name: '# launch-room' }))

    expect(screen.getByRole('heading', { name: '# launch-room' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message timeline')).toHaveTextContent(
      'No messages yet. Start the channel.',
    )
  })

  it('shows a permission denial state for read-only channels', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: '# announcements' }))

    expect(screen.getByText('You can view this channel but cannot send messages.')).toBeInTheDocument()
    expect(screen.getByLabelText('Message composer')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('shows the calendar tab and creates a local meeting', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument()
    const upcomingMeetings = screen.getByLabelText('Upcoming meetings')
    expect(upcomingMeetings).toHaveTextContent('Roadmap Review')
    expect(upcomingMeetings).toHaveTextContent('Join URL')

    await userEvent.click(screen.getByRole('button', { name: 'New meeting' }))

    const dialog = screen.getByRole('dialog', { name: 'Create meeting' })
    await userEvent.type(within(dialog).getByLabelText('Meeting title'), 'Design Sync')
    fireEvent.change(within(dialog).getByLabelText('Start time'), {
      target: { value: '2026-06-25T10:00' },
    })
    fireEvent.change(within(dialog).getByLabelText('End time'), {
      target: { value: '2026-06-25T10:30' },
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create meeting' }))

    expect(screen.queryByRole('dialog', { name: 'Create meeting' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Upcoming meetings')).toHaveTextContent('Design Sync')
    expect(screen.getByLabelText('Upcoming meetings')).toHaveTextContent(
      'http://localhost:8080/join/local-design-sync',
    )
  })

  it('opens and leaves a meeting room from the calendar', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    const upcomingMeetings = screen.getByLabelText('Upcoming meetings')
    const roadmapMeeting = within(upcomingMeetings).getByText('Roadmap Review').closest('article')
    expect(roadmapMeeting).not.toBeNull()

    await userEvent.click(
      within(roadmapMeeting!).getByRole('button', { name: 'Join meeting Roadmap Review' }),
    )

    const meetingRoom = screen.getByRole('region', { name: 'Meeting room' })
    expect(meetingRoom).toHaveTextContent('Roadmap Review')
    expect(meetingRoom).toHaveTextContent('Media room connected')
    expect(meetingRoom).toHaveTextContent('http://localhost:8080/join/mtg-roadmap-review')
    expect(within(meetingRoom).getByLabelText('You connected')).toBeInTheDocument()
    expect(within(meetingRoom).getByLabelText('Mira connected')).toBeInTheDocument()

    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Mute meeting microphone' }))
    expect(within(meetingRoom).getByRole('button', { name: 'Unmute meeting microphone' })).toBeInTheDocument()

    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Turn camera off' }))
    expect(within(meetingRoom).getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument()

    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Leave meeting' }))

    expect(screen.queryByRole('region', { name: 'Meeting room' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument()
  })

  it('shows voice channels with connected users and local controls', async () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Channel navigation' })
    expect(within(navigation).getByText('Voice channels')).toBeInTheDocument()
    expect(within(navigation).getByRole('button', { name: 'Voice: Standup' })).toBeInTheDocument()
    const currentVoice = screen.getByLabelText('Current voice participants')
    expect(within(currentVoice).getByLabelText('Thanet speaking')).toBeInTheDocument()
    expect(within(currentVoice).getByLabelText('You connected')).toBeInTheDocument()

    const voiceControls = screen.getByLabelText('Voice controls')
    expect(within(voiceControls).getByText('Voice connected')).toBeInTheDocument()
    expect(within(voiceControls).getByText('Standup')).toBeInTheDocument()
    expect(within(voiceControls).getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument()
    expect(within(voiceControls).getByRole('button', { name: 'Deafen audio' })).toBeInTheDocument()
    expect(within(voiceControls).getByRole('button', { name: 'Disconnect voice' })).toBeInTheDocument()
  })

  it('updates local voice controls and switches voice channels', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Mute microphone' }))
    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Current voice participants')).getByLabelText('You muted'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Deafen audio' }))
    expect(screen.getByRole('button', { name: 'Undeafen audio' })).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Current voice participants')).getByLabelText('You deafened'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Join Voice: Office Hours' }))
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Office Hours')
    expect(
      within(screen.getByLabelText('Current voice participants')).getByLabelText('You deafened'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect voice' }))
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Not connected')
    expect(screen.getByRole('button', { name: 'Join Voice: Standup' })).toBeInTheDocument()
  })

  it('starts and stops a mocked screen share from the voice controls', async () => {
    const stop = vi.fn()
    const screenShare = stubScreenShare({
      track: createScreenShareTrack({ stop }),
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop screen share' })).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Screen sharing')
    expect(screenShare.getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true })

    await userEvent.click(screen.getByRole('button', { name: 'Stop screen share' }))

    expect(stop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument()
  })

  it('shows a screen share failure when capture permission is denied', async () => {
    stubScreenShare({
      error: new DOMException('Permission denied', 'NotAllowedError'),
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Screen share blocked')
    })
    expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument()
  })

  it('clears screen share state when the captured track ends externally', async () => {
    let endedListener: (() => void) | undefined
    stubScreenShare({
      track: createScreenShareTrack({
        onEnded(listener) {
          endedListener = listener
        },
      }),
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop screen share' })).toBeInTheDocument()
    })
    endedListener?.()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Voice controls')).not.toHaveTextContent('Screen sharing')
  })

  it('adds, switches, removes, and persists multiple server connections', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch to Local OpenCord' })).toBeInTheDocument()
    })

    await userEvent.clear(screen.getByLabelText('Server display name'))
    await userEvent.type(screen.getByLabelText('Server display name'), 'Company Chat')
    await userEvent.clear(screen.getByLabelText('Server URL'))
    await userEvent.type(screen.getByLabelText('Server URL'), 'https://chat.company.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch to Company Chat' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('https://chat.company.com')).not.toHaveLength(0)
    expect(screen.getByText('Realtime ready')).toHaveAttribute(
      'data-realtime-url',
      'wss://chat.company.com/ws',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Switch to Local OpenCord' }))
    expect(screen.getByText('Realtime ready')).toHaveAttribute(
      'data-realtime-url',
      'ws://localhost:8080/ws',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Company Chat' }))
    expect(screen.queryByRole('button', { name: 'Switch to Company Chat' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('opencord.serverConnections:v1')).toContain(
      'Local OpenCord',
    )
  })
})

function stubScreenShare({
  error,
  track,
}: {
  error?: Error
  track?: MediaStreamTrack
}) {
  const getDisplayMedia = vi.fn()
  if (error) {
    getDisplayMedia.mockRejectedValue(error)
  } else {
    const mediaTrack = track ?? createScreenShareTrack()
    getDisplayMedia.mockResolvedValue({
      getTracks: () => [mediaTrack],
      getVideoTracks: () => [mediaTrack],
    } as unknown as MediaStream)
  }

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia },
  })

  return { getDisplayMedia }
}

function createScreenShareTrack({
  onEnded,
  stop = vi.fn(),
}: {
  onEnded?: (listener: () => void) => void
  stop?: () => void
} = {}) {
  return {
    addEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      if (event === 'ended' && typeof listener === 'function') {
        onEnded?.(() => listener(new Event('ended')))
      }
    },
    kind: 'video',
    stop,
  } as unknown as MediaStreamTrack
}
