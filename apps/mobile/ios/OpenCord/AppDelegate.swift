import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import livekit_react_native
import livekit_react_native_webrtc

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    LivekitReactNative.setup()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "OpenCord",
      in: window,
      initialProperties: openCordInitialProperties(),
      launchOptions: launchOptions
    )

    return true
  }

  func application(
    _ application: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    RCTLinkingManager.application(application, open: url, options: options)
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }
}

private func openCordInitialProperties() -> [String: Any]? {
#if DEBUG
  let environment = ProcessInfo.processInfo.environment
  guard environment["OPENCORD_MOBILE_E2E"] == "1" else {
    return nil
  }

  var config: [String: Any] = [
    "enabled": true,
    "autoJoinMeeting": environment["OPENCORD_E2E_AUTO_JOIN_MEETING"] == "1",
    "autoJoinVoice": environment["OPENCORD_E2E_AUTO_JOIN_VOICE"] == "1",
  ]
  if let serverUrl = environment["OPENCORD_E2E_SERVER_URL"] {
    config["serverUrl"] = serverUrl
  }
  if let email = environment["OPENCORD_E2E_EMAIL"] {
    config["email"] = email
  }
  if let password = environment["OPENCORD_E2E_PASSWORD"] {
    config["password"] = password
  }
  if let preferredVoiceChannelName = environment["OPENCORD_E2E_VOICE_CHANNEL"] {
    config["preferredVoiceChannelName"] = preferredVoiceChannelName
  }
  if let meetingId = environment["OPENCORD_E2E_MEETING_ID"] {
    config["meetingId"] = meetingId
  }
  if let meetingTitle = environment["OPENCORD_E2E_MEETING_TITLE"] {
    config["meetingTitle"] = meetingTitle
  }
  if let runId = environment["OPENCORD_E2E_RUN_ID"] {
    config["runId"] = runId
  }
  if let commandUrl = environment["OPENCORD_E2E_COMMAND_URL"] {
    config["commandUrl"] = commandUrl
  }

  return ["initialE2EConfig": config]
#else
  return nil
#endif
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
