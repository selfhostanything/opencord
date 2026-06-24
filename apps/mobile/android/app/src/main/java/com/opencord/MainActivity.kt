package com.opencord

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.oney.WebRTCModule.WebRTCModuleOptions

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    WebRTCModuleOptions.getInstance().enableMediaProjectionService = true
    super.onCreate(savedInstanceState)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "OpenCord"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle? = openCordInitialProperties()
      }

  private fun openCordInitialProperties(): Bundle? {
    if (!intent.getBooleanExtra("OPENCORD_MOBILE_E2E", false)) {
      return null
    }

    val config = Bundle()
    config.putBoolean("enabled", true)
    config.putBoolean(
      "autoJoinMeeting",
      intent.getBooleanExtra("OPENCORD_E2E_AUTO_JOIN_MEETING", false),
    )
    config.putBoolean(
      "autoJoinVoice",
      intent.getBooleanExtra("OPENCORD_E2E_AUTO_JOIN_VOICE", false),
    )
    config.putBoolean(
      "demoWorkspace",
      intent.getBooleanExtra("OPENCORD_E2E_DEMO_WORKSPACE", false),
    )
    putStringExtra(config, "serverUrl", "OPENCORD_E2E_SERVER_URL")
    putStringExtra(config, "email", "OPENCORD_E2E_EMAIL")
    putStringExtra(config, "password", "OPENCORD_E2E_PASSWORD")
    putStringExtra(config, "preferredVoiceChannelName", "OPENCORD_E2E_VOICE_CHANNEL")
    putStringExtra(config, "meetingId", "OPENCORD_E2E_MEETING_ID")
    putStringExtra(config, "meetingTitle", "OPENCORD_E2E_MEETING_TITLE")
    putStringExtra(config, "runId", "OPENCORD_E2E_RUN_ID")
    putStringExtra(config, "commandUrl", "OPENCORD_E2E_COMMAND_URL")

    return Bundle().apply {
      putBundle("initialE2EConfig", config)
    }
  }

  private fun putStringExtra(config: Bundle, key: String, extraName: String) {
    val value = intent.getStringExtra(extraName)?.trim()
    if (!value.isNullOrEmpty()) {
      config.putString(key, value)
    }
  }
}
