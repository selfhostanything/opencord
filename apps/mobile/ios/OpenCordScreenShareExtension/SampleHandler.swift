import CoreImage
import Foundation
import ReplayKit

final class SampleHandler: RPBroadcastSampleHandler {
  private let appGroupIdentifier = "group.com.opencord.screenshare"
  private let socketFileName = "rtc_SSFD"
  private let imageContext = CIContext()
  private var socketFileDescriptor: Int32 = -1

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    socketFileDescriptor = connectToScreenShareSocket()
  }

  override func broadcastFinished() {
    closeScreenShareSocket()
  }

  override func processSampleBuffer(
    _ sampleBuffer: CMSampleBuffer,
    with sampleBufferType: RPSampleBufferType
  ) {
    guard sampleBufferType == .video else {
      return
    }
    guard socketFileDescriptor >= 0 else {
      socketFileDescriptor = connectToScreenShareSocket()
      return
    }
    guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    sendFrame(imageBuffer)
  }

  private func connectToScreenShareSocket() -> Int32 {
    guard
      let containerUrl = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      )
    else {
      return -1
    }

    let socketPath = containerUrl.appendingPathComponent(socketFileName).path
    let descriptor = socket(AF_UNIX, SOCK_STREAM, 0)
    guard descriptor >= 0 else {
      return -1
    }

    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)
    let pathBytes = Array(socketPath.utf8)
    let maxPathLength = MemoryLayout.size(ofValue: address.sun_path)
    guard pathBytes.count < maxPathLength else {
      close(descriptor)
      return -1
    }

    withUnsafeMutableBytes(of: &address.sun_path) { buffer in
      for (index, byte) in pathBytes.enumerated() {
        buffer[index] = byte
      }
      buffer[pathBytes.count] = 0
    }

    let connected = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        connect(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    if connected < 0 {
      close(descriptor)
      return -1
    }

    return descriptor
  }

  private func closeScreenShareSocket() {
    guard socketFileDescriptor >= 0 else {
      return
    }

    close(socketFileDescriptor)
    socketFileDescriptor = -1
  }

  private func sendFrame(_ imageBuffer: CVImageBuffer) {
    let width = CVPixelBufferGetWidth(imageBuffer)
    let height = CVPixelBufferGetHeight(imageBuffer)
    let image = CIImage(cvPixelBuffer: imageBuffer)
    guard
      let frameData = imageContext.jpegRepresentation(
        of: image,
        colorSpace: CGColorSpaceCreateDeviceRGB(),
        options: [:]
      )
    else {
      return
    }

    let header =
      "Content-Length: \(frameData.count)\r\n" +
      "Buffer-Width: \(width)\r\n" +
      "Buffer-Height: \(height)\r\n" +
      "Buffer-Orientation: 1\r\n\r\n"

    writeAll(Data(header.utf8))
    writeAll(frameData)
  }

  private func writeAll(_ data: Data) {
    guard socketFileDescriptor >= 0 else {
      return
    }

    data.withUnsafeBytes { rawBuffer in
      guard let baseAddress = rawBuffer.baseAddress else {
        return
      }

      var offset = 0
      while offset < data.count {
        let written = Darwin.write(
          socketFileDescriptor,
          baseAddress.advanced(by: offset),
          data.count - offset
        )
        if written <= 0 {
          closeScreenShareSocket()
          return
        }
        offset += written
      }
    }
  }
}
