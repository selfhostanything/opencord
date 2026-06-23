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
  messagesForChannel,
  mobileReducer,
  selectedChannel,
  type MobileChannel,
  type MobileMessage,
} from './src/mobileState'

export default function App() {
  const [state, dispatch] = useReducer(mobileReducer, undefined, createInitialMobileState)
  const [serverUrl, setServerUrl] = useState(state.serverUrl)
  const [email, setEmail] = useState('')
  const [composerText, setComposerText] = useState('')
  const activeChannel = selectedChannel(state)
  const activeServer = activeMobileServerConnection(state)
  const visibleMessages = useMemo(() => messagesForChannel(state), [state])

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
              onPress={() => dispatch({ type: 'channel.select', channelId: item.id })}
            />
          )}
          contentContainerStyle={styles.listContent}
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

function ChannelRow({ channel, onPress }: { channel: MobileChannel; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.channelRow}>
      <View>
        <Text style={styles.channelName}># {channel.name}</Text>
        <Text style={styles.subtle}>{channel.topic}</Text>
      </View>
      {channel.unread ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  )
}

function MessageBubble({ message }: { message: MobileMessage }) {
  return (
    <View style={[styles.message, message.own ? styles.ownMessage : null]}>
      <Text style={styles.messageAuthor}>{message.authorName}</Text>
      <Text style={styles.messageContent}>{message.content}</Text>
      <Text style={styles.messageTime}>{message.time}</Text>
    </View>
  )
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
