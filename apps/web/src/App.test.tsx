import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/react-router'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { createAppRouter } from './app/router'

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

    expect(await screen.findByLabelText('Space rail')).toBeInTheDocument()
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

  it('renders typed workspace routes for channel, calendar, developer, and meeting surfaces', async () => {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: ['/servers/local/spaces/opencord/channels/general/calendar'],
      }),
    })

    render(<App router={router} />)

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument()

    await router.navigate({
      to: '/servers/$serverId/spaces/$spaceId/channels/$channelId/developers',
      params: { serverId: 'local', spaceId: 'opencord', channelId: 'general' },
    })

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Developer settings' })).toBeInTheDocument()
    })

    await router.navigate({
      to: '/servers/$serverId/spaces/$spaceId/channels/$channelId/meetings/$meetingId',
      params: {
        serverId: 'local',
        spaceId: 'opencord',
        channelId: 'general',
        meetingId: 'meeting-roadmap-review',
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '# general' })).toBeInTheDocument()
    })
  })

  it('renders top-level shortcut routes for calendar, developers, and meetings', async () => {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: ['/calendar'],
      }),
    })

    render(<App router={router} />)

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument()

    await router.navigate({ to: '/developers' })

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Developer settings' })).toBeInTheDocument()
    })

    await router.navigate({
      to: '/meetings/$meetingId',
      params: { meetingId: 'meeting-roadmap-review' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Leave meeting' })).toBeInTheDocument()
    })
  })

  it('renders Discord-style rich embed cards in the message timeline', () => {
    render(<App />)

    const timeline = screen.getByLabelText('Message timeline')
    const embed = within(timeline).getByRole('article', {
      name: 'Rich embed: Deploy preview ready',
    })

    expect(embed).toHaveTextContent('Deploy preview ready')
    expect(embed).toHaveTextContent('Webhook embed payloads now render in official clients.')
    expect(embed).toHaveTextContent('Environment')
    expect(embed).toHaveTextContent('production')
    expect(embed).toHaveTextContent('Version')
    expect(embed).toHaveTextContent('2026.06.24')
    expect(embed).toHaveTextContent('Release Hook')
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

  it('creates, rotates, and invites a bot from developer settings', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    expect(
      within(developerSettings).getByRole('heading', { name: 'Developer settings' }),
    ).toBeInTheDocument()
    expect(developerSettings).toHaveTextContent('0 bot applications')
    expect(within(developerSettings).getByLabelText('Read messages')).toBeChecked()
    expect(within(developerSettings).getByLabelText('Send messages')).toBeChecked()
    expect(within(developerSettings).getByLabelText('Use slash commands')).toBeChecked()
    await userEvent.click(within(developerSettings).getByLabelText('Manage webhooks'))

    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application name'),
      'Deploy Bot',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application description'),
      'Posts release status into operations channels',
    )
    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Create bot application' }),
    )

    expect(developerSettings).toHaveTextContent('Deploy Bot')
    expect(developerSettings).toHaveTextContent('Posts release status into operations channels')
    const initialToken = within(developerSettings).getByLabelText('Shown-once bot token').textContent
    expect(initialToken).toMatch(/^ocb_/)
    expect(developerSettings).toHaveTextContent('/api/compat/discord/v10')
    expect(developerSettings).toHaveTextContent('/api/compat/discord/gateway')
    const botApplications = within(developerSettings).getByRole('region', {
      name: 'Bot applications',
    })
    expect(botApplications).toHaveTextContent('Read messages')
    expect(botApplications).toHaveTextContent('Send messages')
    expect(botApplications).toHaveTextContent('Use slash commands')
    expect(botApplications).toHaveTextContent('Manage webhooks')

    const auditEvents = within(developerSettings).getByRole('region', {
      name: 'Developer audit events',
    })
    expect(auditEvents).toHaveTextContent('bot.created')
    expect(auditEvents).toHaveTextContent('Deploy Bot')
    expect(auditEvents).toHaveTextContent('Manage webhooks')
    expect(auditEvents).not.toHaveTextContent(initialToken ?? '')

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Rotate token for Deploy Bot',
      }),
    )

    const rotatedToken = within(developerSettings).getByLabelText('Shown-once bot token').textContent
    expect(rotatedToken).toMatch(/^ocb_/)
    expect(rotatedToken).not.toBe(initialToken)
    expect(auditEvents).toHaveTextContent('bot.token_rotated')
    expect(auditEvents).not.toHaveTextContent(rotatedToken ?? '')

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Invite Deploy Bot to OpenCord',
      }),
    )

    expect(developerSettings).toHaveTextContent('Invited to OpenCord')
    expect(auditEvents).toHaveTextContent('bot.invited_to_space')
  })

  it('uses server-backed developer bot APIs when server context is configured', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', version: 'test-version' }),
        }
      }

      if (url.endsWith('/organizations/01973f83-f22a-73ba-ae76-5a045c52fc96/bot-applications')) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            bot_application: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
              bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
              created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc99',
              name: 'Deploy Bot',
              description: 'Posts release status into operations channels',
              status: 'active',
            },
            bot_token: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fca0',
              application_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              token: 'ocb_server_created',
              token_last_four: 'ated',
            },
          }),
        }
      }

      if (url.endsWith('/bot-applications/01973f83-f22a-73ba-ae76-5a045c52fc97/tokens/rotate')) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            bot_token: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fca1',
              application_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              token: 'ocb_server_rotated',
              token_last_four: 'ated',
            },
          }),
        }
      }

      if (
        url.endsWith(
          '/bot-applications/01973f83-f22a-73ba-ae76-5a045c52fc97/spaces/01973f83-f22a-73ba-ae76-5a045c52fca2/invite',
        )
      ) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            bot_application: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
              bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
              created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc99',
              name: 'Deploy Bot',
              description: 'Posts release status into operations channels',
              status: 'active',
            },
            member: {
              space_id: '01973f83-f22a-73ba-ae76-5a045c52fca2',
              user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
              role: 'member',
              status: 'active',
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    await userEvent.type(within(developerSettings).getByLabelText('Session token'), 'session-token')
    await userEvent.type(
      within(developerSettings).getByLabelText('Organization ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fc96',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Space ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fca2',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application name'),
      'Deploy Bot',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application description'),
      'Posts release status into operations channels',
    )
    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Create bot application' }),
    )

    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('ocb_server_created')
    })

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Rotate token for Deploy Bot',
      }),
    )
    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('ocb_server_rotated')
    })

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Invite Deploy Bot to OpenCord',
      }),
    )
    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('Invited to OpenCord')
    })
  })

  it('loads existing server bot applications into developer settings', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', version: 'test-version' }),
        }
      }

      if (url.endsWith('/organizations/01973f83-f22a-73ba-ae76-5a045c52fc96/bot-applications')) {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        expect(init?.method).toBeUndefined()
        return {
          ok: true,
          json: async () => ({
            bot_applications: [
              {
                bot_application: {
                  id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
                  organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
                  bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
                  created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc99',
                  name: 'Loaded Bot',
                  description: null,
                  status: 'active',
                },
                active_token_last_four: 'last',
                space_memberships: [
                  {
                    space_id: '01973f83-f22a-73ba-ae76-5a045c52fca2',
                    user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
                    role: 'member',
                    status: 'active',
                  },
                ],
              },
            ],
          }),
        }
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    await userEvent.type(within(developerSettings).getByLabelText('Session token'), 'session-token')
    await userEvent.type(
      within(developerSettings).getByLabelText('Organization ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fc96',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Space ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fca2',
    )
    await userEvent.click(within(developerSettings).getByRole('button', { name: 'Load server bots' }))

    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('Loaded Bot')
    })
    expect(developerSettings).toHaveTextContent('No description')
    expect(developerSettings).toHaveTextContent('Hidden after creation - last 4 last')
    expect(developerSettings).toHaveTextContent('Invited to OpenCord')
  })

  it('manages server incoming webhooks from developer settings', async () => {
    const channelId = '01973f83-f22a-73ba-ae76-5a045c52fce4'
    const webhookPayload = {
      id: '01973f83-f22a-73ba-ae76-5a045c52fce1',
      organization_id: '01973f83-f22a-73ba-ae76-5a045c52fce2',
      space_id: '01973f83-f22a-73ba-ae76-5a045c52fce3',
      channel_id: channelId,
      bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fce5',
      created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fce6',
      name: 'Release Hook',
      status: 'active',
      token_last_four: 'ated',
      created_at: '2026-06-23T09:00:00.000Z',
    }

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', version: 'test-version' }),
        }
      }

      if (url.endsWith(`/channels/${channelId}/webhooks`) && init?.method === 'POST') {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            webhook: {
              ...webhookPayload,
              token: 'ocw_server_created',
              execute_url:
                'http://localhost:8080/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_server_created',
            },
          }),
        }
      }

      if (url.endsWith(`/channels/${channelId}/webhooks`) && init?.method === undefined) {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            webhooks: [webhookPayload],
          }),
        }
      }

      if (
        url.endsWith(
          `/channels/${channelId}/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/token/rotate`,
        )
      ) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            webhook: {
              ...webhookPayload,
              token: 'ocw_server_rotated',
              execute_url:
                'http://localhost:8080/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_server_rotated',
            },
          }),
        }
      }

      if (url.endsWith(`/channels/${channelId}/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1`)) {
        expect(init).toMatchObject({
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          status: 204,
          json: async () => {
            throw new Error('empty response')
          },
        }
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    await userEvent.type(within(developerSettings).getByLabelText('Session token'), 'session-token')
    await userEvent.type(within(developerSettings).getByLabelText('Webhook channel ID'), channelId)
    await userEvent.type(within(developerSettings).getByLabelText('Webhook name'), 'Release Hook')
    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Create incoming webhook' }),
    )

    const webhooks = within(developerSettings).getByRole('region', {
      name: 'Incoming webhooks',
    })
    await waitFor(() => {
      expect(webhooks).toHaveTextContent('ocw_server_created')
    })

    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Load server webhooks' }),
    )
    await waitFor(() => {
      expect(webhooks).toHaveTextContent('Hidden after creation - last 4 ated')
    })

    await userEvent.click(
      within(webhooks).getByRole('button', {
        name: 'Rotate webhook token for Release Hook',
      }),
    )
    await waitFor(() => {
      expect(webhooks).toHaveTextContent('ocw_server_rotated')
    })

    await userEvent.click(
      within(webhooks).getByRole('button', {
        name: 'Delete webhook Release Hook',
      }),
    )
    await waitFor(() => {
      expect(webhooks).not.toHaveTextContent('Release Hook')
    })
    const auditEvents = within(developerSettings).getByRole('region', {
      name: 'Developer audit events',
    })
    expect(auditEvents).toHaveTextContent('webhook.created')
    expect(auditEvents).toHaveTextContent('webhook.loaded')
    expect(auditEvents).toHaveTextContent('webhook.token_rotated')
    expect(auditEvents).toHaveTextContent('webhook.deleted')
    expect(auditEvents).not.toHaveTextContent('ocw_server_created')
    expect(auditEvents).not.toHaveTextContent('ocw_server_rotated')
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
