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
    vi.unstubAllGlobals()
  })

  it('renders a Discord-like workspace with rail, channels, messages, composer, and members', async () => {
    render(<App />)

    expect(screen.getByLabelText('Space rail')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Channel navigation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '# general' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message timeline')).toHaveTextContent('Welcome to OpenCord')
    expect(screen.getByLabelText('Message composer')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Members' })).toHaveTextContent('Product')

    await waitFor(() => {
      expect(screen.getByText('API online')).toBeInTheDocument()
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
})
