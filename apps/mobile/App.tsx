import { useEffect, useMemo, useReducer, useState } from 'react'
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import {
  activeMobileServerConnection,
  createInitialMobileState,
  mobileCanListenToVoice,
  mobileCanSpeakInVoice,
  messagesForChannel,
  mobileReducer,
  mobileVoiceParticipantsForChannel,
  selectedChannel,
  type MobileChannel,
  type MobileMessage,
  type MobileRichEmbed,
  type MobileVoiceParticipant,
} from './src/mobileState'

export default function App() {
  const [state, dispatch] = useReducer(mobileReducer, undefined, createInitialMobileState)
  const [serverUrl, setServerUrl] = useState(state.serverUrl)
  const [email, setEmail] = useState('')
  const [composerText, setComposerText] = useState('')
  const activeChannel = selectedChannel(state)
  const activeServer = activeMobileServerConnection(state)
  const visibleMessages = useMemo(() => messagesForChannel(state), [state])
  const activeVoiceChannel = state.channels.find(
    (channel) => channel.id === state.voice.connectedChannelId,
  )
  const voiceParticipants = useMemo(() => mobileVoiceParticipantsForChannel(state), [state])

  useEffect(() => {
    setServerUrl(state.serverUrl)
  }, [state.serverUrl])

  function submitLogin() {
    dispatch({ type: 'login.submit', serverUrl, email })
  }

  function switchServer(connectionId: string) {
    dispatch({ type: 'server.switch', connectionId })
  }

  function sendMessage() {
    dispatch({ type: 'message.send', content: composerText })
    setComposerText('')
  }

  if (state.screen === 'login') {
    return (
      <SafeAreaView style={styles.shell}>
        <View style={styles.loginPanel}>
          <Text style={styles.brand}>OpenCord</Text>
          <Text style={styles.subtle}>Connect to OpenCord Cloud or a self-hosted server.</Text>
          <TextInput
            accessibilityLabel="Server URL"
            autoCapitalize="none"
            inputMode="url"
            onChangeText={setServerUrl}
            style={styles.input}
            value={serverUrl}
          />
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#7f877d"
            style={styles.input}
            value={email}
          />
          <Pressable accessibilityRole="button" onPress={submitLogin} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Log in</Text>
          </Pressable>
          <View style={styles.serverList}>
            {state.serverConnections.connections.map((connection) => (
              <View key={connection.id} style={styles.serverRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => switchServer(connection.id)}
                  style={[
                    styles.serverSwitchButton,
                    connection.id === state.serverConnections.activeConnectionId
                      ? styles.activeServerSwitchButton
                      : null,
                  ]}
                >
                  <Text style={styles.serverName}>{connection.displayName}</Text>
                  <Text style={styles.subtle}>{connection.baseUrl}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => dispatch({ type: 'server.remove', connectionId: connection.id })}
                  style={styles.removeServerButton}
                >
                  <Text style={styles.primaryButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (state.screen === 'channels') {
    return (
      <SafeAreaView style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Channels</Text>
            <Text style={styles.subtle}>{activeServer?.displayName ?? state.serverUrl}</Text>
          </View>
          <Text style={styles.status}>{state.realtimeStatus}</Text>
        </View>
        <FlatList
          data={state.channels}
          keyExtractor={(channel) => channel.id}
          renderItem={({ item }) => (
            <ChannelRow
              channel={item}
              connected={state.voice.connectedChannelId === item.id}
              onPress={() => {
                if (item.kind === 'voice') {
                  dispatch({ type: 'voice.join', channelId: item.id })
                  return
                }

                dispatch({ type: 'channel.select', channelId: item.id })
              }}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
        <MobileVoiceTray
          channelName={activeVoiceChannel?.name}
          canListen={mobileCanListenToVoice(state)}
          canSpeak={mobileCanSpeakInVoice(state)}
          participants={voiceParticipants}
          selfDeaf={state.voice.selfDeaf}
          selfMute={state.voice.selfMute}
          onLeave={() => dispatch({ type: 'voice.leave' })}
          onToggleDeaf={() => dispatch({ type: 'voice.toggle_deaf' })}
          onToggleMute={() => dispatch({ type: 'voice.toggle_mute' })}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.shell}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'channel.back' })}>
          <Text style={styles.linkText}>Channels</Text>
        </Pressable>
        <View style={styles.channelTitleBlock}>
          <Text style={styles.title}># {activeChannel.name}</Text>
          <Text style={styles.subtle}>{activeChannel.topic}</Text>
        </View>
      </View>
      <FlatList
        data={visibleMessages}
        keyExtractor={(message) => message.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.timeline}
      />
      <MobileVoiceTray
        channelName={activeVoiceChannel?.name}
        canListen={mobileCanListenToVoice(state)}
        canSpeak={mobileCanSpeakInVoice(state)}
        participants={voiceParticipants}
        selfDeaf={state.voice.selfDeaf}
        selfMute={state.voice.selfMute}
        onLeave={() => dispatch({ type: 'voice.leave' })}
        onToggleDeaf={() => dispatch({ type: 'voice.toggle_deaf' })}
        onToggleMute={() => dispatch({ type: 'voice.toggle_mute' })}
      />
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message composer"
          onChangeText={setComposerText}
          placeholder={`Message #${activeChannel.name}`}
          placeholderTextColor="#7f877d"
          style={styles.composerInput}
          value={composerText}
        />
        <Pressable accessibilityRole="button" onPress={sendMessage} style={styles.sendButton}>
          <Text style={styles.primaryButtonText}>Send</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function ChannelRow({
  channel,
  connected,
  onPress,
}: {
  channel: MobileChannel
  connected: boolean
  onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.channelRow}>
      <View>
        <Text style={styles.channelName}>
          {channel.kind === 'voice' ? 'V' : '#'} {channel.name}
        </Text>
        <Text style={styles.subtle}>{channel.topic}</Text>
      </View>
      {connected ? <Text style={styles.voiceConnectedLabel}>Voice</Text> : null}
      {channel.unread ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  )
}

function MobileVoiceTray({
  canListen,
  canSpeak,
  channelName,
  participants,
  selfDeaf,
  selfMute,
  onLeave,
  onToggleDeaf,
  onToggleMute,
}: {
  canListen: boolean
  canSpeak: boolean
  channelName?: string
  participants: MobileVoiceParticipant[]
  selfDeaf: boolean
  selfMute: boolean
  onLeave: () => void
  onToggleDeaf: () => void
  onToggleMute: () => void
}) {
  if (!channelName) {
    return null
  }

  return (
    <View style={styles.voiceTray}>
      <View style={styles.voiceSummary}>
        <Text style={styles.voiceTitle}>Voice connected</Text>
        <Text style={styles.subtle}>{channelName}</Text>
        <Text style={styles.subtle}>
          {canListen ? 'Listening' : 'Deafened'} / {canSpeak ? 'Speaking' : 'Muted'}
        </Text>
      </View>
      <View style={styles.voiceParticipants}>
        {participants.map((participant) => (
          <Text key={participant.id} style={styles.voiceParticipant}>
            {participant.name} -{' '}
            {participant.self ? voiceSelfStatus(selfMute, selfDeaf) : participant.status}
          </Text>
        ))}
      </View>
      <View style={styles.voiceActions}>
        <Pressable accessibilityRole="button" onPress={onToggleMute} style={styles.voiceButton}>
          <Text style={styles.primaryButtonText}>{selfMute ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onToggleDeaf} style={styles.voiceButton}>
          <Text style={styles.primaryButtonText}>{selfDeaf ? 'Undeaf' : 'Deaf'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onLeave} style={styles.voiceButton}>
          <Text style={styles.primaryButtonText}>Leave</Text>
        </Pressable>
      </View>
    </View>
  )
}

function voiceSelfStatus(selfMute: boolean, selfDeaf: boolean) {
  if (selfDeaf) {
    return 'deafened'
  }

  if (selfMute) {
    return 'muted'
  }

  return 'connected'
}

function MessageBubble({ message }: { message: MobileMessage }) {
  return (
    <View style={[styles.message, message.own ? styles.ownMessage : null]}>
      <Text style={styles.messageAuthor}>{message.authorName}</Text>
      {message.content ? <Text style={styles.messageContent}>{message.content}</Text> : null}
      <MobileRichEmbedList embeds={message.embeds} />
      <Text style={styles.messageTime}>{message.time}</Text>
    </View>
  )
}

function MobileRichEmbedList({ embeds }: { embeds: MobileRichEmbed[] }) {
  if (embeds.length === 0) {
    return null
  }

  return (
    <View style={styles.embedList}>
      {embeds.map((embed, index) => (
        <MobileRichEmbedCard
          key={`${embed.title ?? embed.description ?? 'embed'}-${index}`}
          embed={embed}
        />
      ))}
    </View>
  )
}

function MobileRichEmbedCard({ embed }: { embed: MobileRichEmbed }) {
  return (
    <View
      accessibilityLabel={`Rich embed: ${mobileRichEmbedLabel(embed)}`}
      accessible
      style={[styles.embedCard, { borderLeftColor: mobileRichEmbedAccentColor(embed.color) }]}
    >
      {embed.author?.name ? <Text style={styles.embedAuthor}>{embed.author.name}</Text> : null}
      {embed.title ? <Text style={styles.embedTitle}>{embed.title}</Text> : null}
      {embed.description ? <Text style={styles.embedDescription}>{embed.description}</Text> : null}
      {embed.fields && embed.fields.length > 0 ? (
        <View style={styles.embedFields}>
          {embed.fields.map((field, index) => (
            <View key={`${field.name}-${index}`} style={styles.embedField}>
              <Text style={styles.embedFieldName}>{field.name}</Text>
              <Text style={styles.embedFieldValue}>{field.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {embed.footer?.text ? <Text style={styles.embedFooter}>{embed.footer.text}</Text> : null}
    </View>
  )
}

function mobileRichEmbedLabel(embed: MobileRichEmbed) {
  return embed.title ?? embed.author?.name ?? embed.description?.slice(0, 64) ?? 'Untitled'
}

function mobileRichEmbedAccentColor(color: number | undefined) {
  if (typeof color !== 'number' || !Number.isFinite(color)) {
    return '#4b5fc4'
  }

  const normalized = Math.max(0, Math.min(0xffffff, Math.trunc(color)))
  return `#${normalized.toString(16).padStart(6, '0')}`
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#151515',
  },
  loginPanel: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  brand: {
    color: '#f5f6f3',
    fontSize: 32,
    fontWeight: '800',
  },
  subtle: {
    color: '#aab2a8',
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 48,
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    paddingHorizontal: 14,
  },
  serverList: {
    gap: 8,
    marginTop: 6,
  },
  serverRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  serverSwitchButton: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  activeServerSwitchButton: {
    borderColor: '#28796d',
    backgroundColor: '#1d2b28',
  },
  serverName: {
    color: '#f5f6f3',
    fontSize: 14,
    fontWeight: '800',
  },
  removeServerButton: {
    alignItems: 'center',
    backgroundColor: '#353535',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 82,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#28796d',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    padding: 16,
  },
  title: {
    color: '#f5f6f3',
    fontSize: 20,
    fontWeight: '800',
  },
  status: {
    color: '#86e0bb',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  channelRow: {
    alignItems: 'center',
    backgroundColor: '#202020',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    padding: 14,
  },
  channelName: {
    color: '#f5f6f3',
    fontSize: 16,
    fontWeight: '800',
  },
  unreadDot: {
    backgroundColor: '#4b5fc4',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  voiceConnectedLabel: {
    color: '#86e0bb',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  voiceTray: {
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    gap: 10,
    padding: 12,
  },
  voiceSummary: {
    gap: 2,
  },
  voiceTitle: {
    color: '#f5f6f3',
    fontSize: 15,
    fontWeight: '800',
  },
  voiceParticipants: {
    gap: 4,
  },
  voiceParticipant: {
    color: '#d8ddd5',
    fontSize: 13,
  },
  voiceActions: {
    flexDirection: 'row',
    gap: 8,
  },
  voiceButton: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  linkText: {
    color: '#86e0bb',
    fontWeight: '800',
  },
  channelTitleBlock: {
    flex: 1,
  },
  timeline: {
    padding: 12,
    gap: 10,
  },
  message: {
    alignSelf: 'flex-start',
    backgroundColor: '#202020',
    borderRadius: 8,
    maxWidth: '88%',
    padding: 12,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#203e36',
  },
  messageAuthor: {
    color: '#f5f6f3',
    fontSize: 13,
    fontWeight: '800',
  },
  messageContent: {
    color: '#edf1ea',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
  embedList: {
    gap: 8,
    marginTop: 8,
  },
  embedCard: {
    backgroundColor: '#1a1a1a',
    borderColor: '#343a37',
    borderLeftWidth: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    maxWidth: 320,
    minWidth: 0,
    padding: 10,
  },
  embedAuthor: {
    color: '#cfd6cc',
    fontSize: 12,
    fontWeight: '800',
  },
  embedTitle: {
    color: '#86c5ff',
    fontSize: 14,
    fontWeight: '800',
  },
  embedDescription: {
    color: '#d8ddd5',
    fontSize: 13,
    lineHeight: 18,
  },
  embedFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  embedField: {
    minWidth: 128,
  },
  embedFieldName: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  embedFieldValue: {
    color: '#cfd6cc',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  embedFooter: {
    color: '#9ea49b',
    fontSize: 11,
    marginTop: 2,
  },
  messageTime: {
    color: '#aab2a8',
    fontSize: 11,
    marginTop: 6,
  },
  composer: {
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  composerInput: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#28796d',
    borderRadius: 8,
    justifyContent: 'center',
    minWidth: 72,
  },
})
