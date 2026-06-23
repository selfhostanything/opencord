import { render, screen, waitFor, within } from '@testing-library/react'
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
