import AVFoundation
import CallKit
import Foundation
import React

@objc(OpenCordCallControls)
class OpenCordCallControls: RCTEventEmitter, CXProviderDelegate {
  private let callController = CXCallController()
  private let provider: CXProvider
  private var activeCalls: [UUID: String] = [:]

  override init() {
    let configuration = CXProviderConfiguration(localizedName: "OpenCord")
    configuration.supportsVideo = true
    configuration.maximumCallGroups = 1
    configuration.maximumCallsPerCallGroup = 1
    configuration.includesCallsInRecents = false
    configuration.supportedHandleTypes = [.generic]

    provider = CXProvider(configuration: configuration)
    super.init()
    provider.setDelegate(self, queue: nil)
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["OpenCordCallControls.endCall"]
  }

  @objc(setup:resolver:rejecter:)
  func setup(
    _ options: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    configureAudioSession()
    NSLog("OpenCordCallControls setup")
    resolve(true)
  }

  @objc(hasPhoneAccount:rejecter:)
  func hasPhoneAccount(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(true)
  }

  @objc(setAvailable:)
  func setAvailable(_ active: Bool) {
  }

  @objc(startCall:handle:displayName:handleType:hasVideo:resolver:rejecter:)
  func startCall(
    _ uuidString: String,
    handle: String,
    displayName: String?,
    handleType: String?,
    hasVideo: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let uuid = UUID(uuidString: uuidString) else {
      reject("opencord_call_controls_uuid", "Invalid call UUID.", nil)
      return
    }

    configureAudioSession()
    let callHandle = CXHandle(type: .generic, value: handle)
    let action = CXStartCallAction(call: uuid, handle: callHandle)
    action.isVideo = hasVideo

    callController.request(CXTransaction(action: action)) { [weak self] error in
      guard let self else { return }
      if let error {
        reject("opencord_call_controls_start", error.localizedDescription, error)
        return
      }

      let update = CXCallUpdate()
      update.localizedCallerName = displayName ?? "OpenCord voice"
      update.remoteHandle = callHandle
      update.hasVideo = hasVideo

      self.activeCalls[uuid] = uuidString
      self.provider.reportCall(with: uuid, updated: update)
      self.provider.reportOutgoingCall(with: uuid, startedConnectingAt: nil)
      self.provider.reportOutgoingCall(with: uuid, connectedAt: nil)
      NSLog("OpenCordCallControls started uuid=%@ displayName=%@", uuidString, displayName ?? "")
      resolve(true)
    }
  }

  @objc(reportConnectedOutgoingCallWithUUID:)
  func reportConnectedOutgoingCallWithUUID(_ uuidString: String) {
    guard let uuid = UUID(uuidString: uuidString) else { return }
    NSLog("OpenCordCallControls connected uuid=%@", uuidString)
    provider.reportOutgoingCall(with: uuid, connectedAt: nil)
  }

  @objc(setCurrentCallActive:)
  func setCurrentCallActive(_ uuidString: String) {
    guard let uuid = UUID(uuidString: uuidString) else { return }
    NSLog("OpenCordCallControls active uuid=%@", uuidString)
    provider.reportOutgoingCall(with: uuid, connectedAt: nil)
  }

  @objc(setMutedCall:muted:)
  func setMutedCall(_ uuidString: String, muted: Bool) {
    guard let uuid = UUID(uuidString: uuidString) else { return }
    NSLog("OpenCordCallControls muted uuid=%@ muted=%@", uuidString, muted.description)
    callController.request(CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: muted))) { _ in
    }
  }

  @objc(endCall:)
  func endCall(_ uuidString: String) {
    guard let uuid = UUID(uuidString: uuidString) else { return }
    NSLog("OpenCordCallControls ending uuid=%@", uuidString)
    callController.request(CXTransaction(action: CXEndCallAction(call: uuid))) { [weak self] _ in
      self?.activeCalls.removeValue(forKey: uuid)
      self?.provider.reportCall(with: uuid, endedAt: nil, reason: .remoteEnded)
    }
  }

  func providerDidReset(_ provider: CXProvider) {
    activeCalls.removeAll()
  }

  func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    activeCalls[action.callUUID] = action.callUUID.uuidString
    NSLog("OpenCordCallControls providerStart uuid=%@", action.callUUID.uuidString)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    let uuidString = activeCalls.removeValue(forKey: action.callUUID) ?? action.callUUID.uuidString
    NSLog("OpenCordCallControls providerEnd uuid=%@", uuidString)
    sendEvent(withName: "OpenCordCallControls.endCall", body: ["callUUID": uuidString])
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    action.fulfill()
  }

  private func configureAudioSession() {
    try? AVAudioSession.sharedInstance().setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.allowBluetoothHFP, .defaultToSpeaker],
    )
  }
}
