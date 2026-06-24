import { describe, expect, it } from 'vitest'

import { workspaceRoutePathForTarget } from './router'

describe('web workspace route contracts', () => {
  it('builds reference web paths from shared route targets', () => {
    expect(
      workspaceRoutePathForTarget({
        kind: 'channel',
        serverId: 'local-opencord',
        organizationId: 'org-1',
        spaceId: 'space-1',
        channelId: 'general',
      }),
    ).toBe('/servers/local-opencord/spaces/space-1/channels/general')

    expect(
      workspaceRoutePathForTarget({
        kind: 'meeting',
        serverId: 'local-opencord',
        organizationId: 'org-1',
        spaceId: 'space-1',
        channelId: 'general',
        meetingId: 'meeting-1',
      }),
    ).toBe('/servers/local-opencord/spaces/space-1/channels/general/meetings/meeting-1')
  })
})
