package com.opencord

import android.net.Uri
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.TelecomManager
import android.telecom.VideoProfile
import java.util.concurrent.ConcurrentHashMap

internal object OpenCordCallRegistry {
  private val connections = ConcurrentHashMap<String, OpenCordCallConnection>()
  var onEnded: ((String) -> Unit)? = null

  fun put(uuid: String, connection: OpenCordCallConnection) {
    connections[uuid] = connection
  }

  fun activate(uuid: String) {
    connections[uuid]?.setActive()
  }

  fun end(uuid: String) {
    connections.remove(uuid)?.disconnectFromOpenCord()
  }

  fun remove(uuid: String, notify: Boolean) {
    connections.remove(uuid)
    if (notify) {
      onEnded?.invoke(uuid)
    }
  }
}

class OpenCordConnectionService : ConnectionService() {
  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: android.telecom.PhoneAccountHandle?,
    request: ConnectionRequest,
  ): Connection {
    val extras = callExtras(request.extras)
    val uuid = extras.getString(EXTRA_CALL_UUID) ?: request.address?.schemeSpecificPart.orEmpty()
    val displayName = extras.getString(EXTRA_DISPLAY_NAME) ?: "OpenCord voice"
    val hasVideo = extras.getBoolean(EXTRA_HAS_VIDEO, false)
    val connection = OpenCordCallConnection(uuid.ifBlank { displayName })

    connection.setAddress(request.address ?: Uri.EMPTY, TelecomManager.PRESENTATION_ALLOWED)
    connection.setAudioModeIsVoip(true)
    connection.setCallerDisplayName(displayName, TelecomManager.PRESENTATION_ALLOWED)
    connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED)
    connection.setInitialized()
    connection.setVideoState(
      if (hasVideo) VideoProfile.STATE_BIDIRECTIONAL else VideoProfile.STATE_AUDIO_ONLY,
    )
    connection.setActive()

    OpenCordCallRegistry.put(connection.uuid, connection)
    return connection
  }

  override fun onCreateOutgoingConnectionFailed(
    connectionManagerPhoneAccount: android.telecom.PhoneAccountHandle?,
    request: ConnectionRequest,
  ) {
    val uuid = callExtras(request.extras).getString(EXTRA_CALL_UUID)
    if (uuid != null) {
      OpenCordCallRegistry.remove(uuid, notify = true)
    }
  }

  private fun callExtras(extras: Bundle?): Bundle {
    return extras?.getBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS) ?: extras ?: Bundle()
  }

  companion object {
    const val EXTRA_CALL_UUID = "com.opencord.CALL_UUID"
    const val EXTRA_DISPLAY_NAME = "com.opencord.DISPLAY_NAME"
    const val EXTRA_HAS_VIDEO = "com.opencord.HAS_VIDEO"
  }
}

internal class OpenCordCallConnection(val uuid: String) : Connection() {
  override fun onDisconnect() {
    disconnectFromSystem(notify = true)
  }

  override fun onAbort() {
    disconnectFromSystem(notify = true)
  }

  override fun onReject() {
    disconnectFromSystem(notify = true)
  }

  override fun onHold() {
    setOnHold()
  }

  override fun onUnhold() {
    setActive()
  }

  fun disconnectFromOpenCord() {
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
  }

  private fun disconnectFromSystem(notify: Boolean) {
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
    OpenCordCallRegistry.remove(uuid, notify)
  }
}
