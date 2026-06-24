package com.opencord

import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telecom.VideoProfile
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class OpenCordCallControlsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val telecomManager: TelecomManager
    get() = reactContext.getSystemService(TelecomManager::class.java)

  private val phoneAccountHandle: PhoneAccountHandle by lazy {
    PhoneAccountHandle(
      ComponentName(reactContext, OpenCordConnectionService::class.java),
      PHONE_ACCOUNT_ID,
    )
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun hasPhoneAccount(promise: Promise) {
    try {
      promise.resolve(telecomManager.getPhoneAccount(phoneAccountHandle) != null)
    } catch (error: RuntimeException) {
      promise.reject("opencord_call_controls_phone_account", error)
    }
  }

  @ReactMethod
  fun setup(options: ReadableMap?, promise: Promise) {
    try {
      registerPhoneAccount()
      OpenCordCallRegistry.onEnded = ::emitEnded
      promise.resolve(true)
    } catch (error: RuntimeException) {
      promise.reject("opencord_call_controls_setup", error)
    }
  }

  @ReactMethod
  fun setAvailable(active: Boolean) {
    Log.i(TAG, "OpenCord call controls availability=$active")
  }

  @ReactMethod
  fun startCall(
    uuid: String,
    handle: String,
    displayName: String?,
    handleType: String?,
    hasVideo: Boolean,
    promise: Promise,
  ) {
    try {
      registerPhoneAccount()
      OpenCordCallRegistry.onEnded = ::emitEnded

      val outgoingExtras =
        Bundle().apply {
          putString(OpenCordConnectionService.EXTRA_CALL_UUID, uuid)
          putString(OpenCordConnectionService.EXTRA_DISPLAY_NAME, displayName ?: "OpenCord voice")
          putBoolean(OpenCordConnectionService.EXTRA_HAS_VIDEO, hasVideo)
        }
      val telecomExtras =
        Bundle().apply {
          putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle)
          putBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS, outgoingExtras)
          putInt(
            TelecomManager.EXTRA_START_CALL_WITH_VIDEO_STATE,
            if (hasVideo) VideoProfile.STATE_BIDIRECTIONAL else VideoProfile.STATE_AUDIO_ONLY,
          )
        }

      telecomManager.placeCall(Uri.fromParts(PhoneAccount.SCHEME_SIP, handle, null), telecomExtras)
      Log.i(TAG, "Started OpenCord native call uuid=$uuid displayName=${displayName ?: ""}")
      promise.resolve(true)
    } catch (error: RuntimeException) {
      promise.reject("opencord_call_controls_start", error)
    }
  }

  @ReactMethod
  fun reportConnectedOutgoingCallWithUUID(uuid: String) {
    Log.i(TAG, "OpenCord native call connected uuid=$uuid")
    OpenCordCallRegistry.activate(uuid)
  }

  @ReactMethod
  fun setCurrentCallActive(uuid: String) {
    Log.i(TAG, "OpenCord native call active uuid=$uuid")
    OpenCordCallRegistry.activate(uuid)
  }

  @ReactMethod
  fun setMutedCall(uuid: String, muted: Boolean) {
    Log.i(TAG, "OpenCord native call muted uuid=$uuid muted=$muted")
  }

  @ReactMethod
  fun endCall(uuid: String) {
    Log.i(TAG, "Ending OpenCord native call uuid=$uuid")
    OpenCordCallRegistry.end(uuid)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by NativeEventEmitter.
  }

  private fun registerPhoneAccount() {
    val account =
      PhoneAccount.builder(phoneAccountHandle, "OpenCord")
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .addSupportedUriScheme(PhoneAccount.SCHEME_SIP)
        .addSupportedUriScheme(PhoneAccount.SCHEME_TEL)
        .build()
    telecomManager.registerPhoneAccount(account)
  }

  private fun emitEnded(uuid: String) {
    val payload = Arguments.createMap().apply { putString("callUUID", uuid) }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(END_CALL_EVENT, payload)
  }

  companion object {
    const val MODULE_NAME = "OpenCordCallControls"
    const val END_CALL_EVENT = "OpenCordCallControls.endCall"
    private const val PHONE_ACCOUNT_ID = "opencord"
    private const val TAG = "OpenCordCallControls"
  }
}
